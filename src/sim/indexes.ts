import { PolityStats, TimelineEvent, TerritorialChange, War, WorldBundle } from '../core/types.js';

export type SearchResult = {
  kind: 'event' | 'polity' | 'war' | 'change';
  id: string;
  year: number | null;
  title: string;
  snippet?: string;
};

type SearchEntry = SearchResult & { tokens: string[]; haystack: string };

type StatSeriesPoint = {
  year: number;
  stats: Pick<PolityStats, 'powerScore' | 'population' | 'gdp' | 'techLevel' | 'stability' | 'military'>;
};

export type WorldIndexes = {
  eventsByYear: Map<number, string[]>;
  eventsByPolity: Map<string, string[]>;
  changesByPolity: Map<string, string[]>;
  changesByYear: Map<number, string[]>;
  eventsById: Map<string, TimelineEvent>;
  changesById: Map<string, TerritorialChange>;
  warsById: Map<string, War>;
  searchEntries: SearchEntry[];
  searchTokenMap: Map<string, number[]>;
  polityStatsSeries: Map<string, StatSeriesPoint[]>;
};

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
};

const uniqueTokens = (tokens: string[]): string[] => Array.from(new Set(tokens));

const ensureMapEntry = <K, V>(map: Map<K, V[]>, key: K): V[] => {
  if (!map.has(key)) {
    map.set(key, [] as V[]);
  }
  return map.get(key) as V[];
};

const cloneStats = (stats: PolityStats): PolityStats => ({
  population: stats.population,
  gdp: stats.gdp,
  techLevel: stats.techLevel,
  industrialCapacity: stats.industrialCapacity,
  resourceSecurity: stats.resourceSecurity,
  military: stats.military,
  navalProjection: stats.navalProjection,
  stability: stats.stability,
  legitimacy: stats.legitimacy,
  logistics: stats.logistics,
  powerScore: stats.powerScore
});

const summarizeStats = (stats: PolityStats): StatSeriesPoint['stats'] => ({
  powerScore: stats.powerScore,
  population: stats.population,
  gdp: stats.gdp,
  techLevel: stats.techLevel,
  stability: stats.stability,
  military: stats.military
});

export function buildWorldIndexes(world: WorldBundle): WorldIndexes {
  const eventsByYear = new Map<number, string[]>();
  const eventsByPolity = new Map<string, string[]>();
  const changesByPolity = new Map<string, string[]>();
  const changesByYear = new Map<number, string[]>();
  const eventsById = new Map(world.events.map((event) => [event.id, event]));
  const changesById = new Map(world.territorialChanges.map((change) => [change.id, change]));
  const warsById = new Map(world.wars.map((war) => [war.id, war]));
  const searchEntries: SearchEntry[] = [];
  const searchTokenMap = new Map<string, number[]>();

  for (const event of world.events) {
    ensureMapEntry(eventsByYear, event.year).push(event.id);
    const actors = [...event.actors.primary, ...(event.actors.secondary ?? [])];
    for (const polityId of actors) {
      ensureMapEntry(eventsByPolity, polityId).push(event.id);
    }
    const haystack = `${event.title} ${event.explanation.join(' ')} ${event.id}`.trim();
    const tokens = uniqueTokens(tokenize(haystack));
    searchEntries.push({
      kind: 'event',
      id: event.id,
      year: event.year,
      title: event.title,
      snippet: event.explanation[0],
      tokens,
      haystack: haystack.toLowerCase()
    });
  }

  for (const polity of world.politiesInitial) {
    const haystack = `${polity.name} ${polity.id}`.trim();
    const tokens = uniqueTokens(tokenize(haystack));
    searchEntries.push({
      kind: 'polity',
      id: polity.id,
      year: null,
      title: polity.name,
      snippet: polity.name,
      tokens,
      haystack: haystack.toLowerCase()
    });
  }

  for (const war of world.wars) {
    const haystack = `${war.name} ${war.id}`.trim();
    const tokens = uniqueTokens(tokenize(haystack));
    searchEntries.push({
      kind: 'war',
      id: war.id,
      year: war.startYear,
      title: war.name,
      snippet: war.explanation[0],
      tokens,
      haystack: haystack.toLowerCase()
    });
  }

  for (const change of world.territorialChanges) {
    const title = `${change.type} ${change.id}`;
    const haystack = `${title} ${change.reason ?? ''}`.trim();
    const tokens = uniqueTokens(tokenize(haystack));
    searchEntries.push({
      kind: 'change',
      id: change.id,
      year: change.year,
      title,
      snippet: change.reason,
      tokens,
      haystack: haystack.toLowerCase()
    });

    ensureMapEntry(changesByYear, change.year).push(change.id);
    if (change.winnerPolityId) {
      ensureMapEntry(changesByPolity, change.winnerPolityId).push(change.id);
    }
    if (change.loserPolityId) {
      ensureMapEntry(changesByPolity, change.loserPolityId).push(change.id);
    }
  }

  searchEntries.forEach((entry, index) => {
    entry.tokens.forEach((token) => {
      ensureMapEntry(searchTokenMap, token).push(index);
    });
  });

  const polityStatsSeries = new Map<string, StatSeriesPoint[]>();
  const statsByPolity = new Map<string, PolityStats>();
  world.politiesInitial.forEach((polity) => {
    statsByPolity.set(polity.id, cloneStats(polity.stats));
    polityStatsSeries.set(polity.id, []);
  });

  const deltasByYear = new Map<number, WorldBundle['timelineIndex']['deltasBetweenSnapshots'][number]>();
  world.timelineIndex.deltasBetweenSnapshots.forEach((delta) => {
    deltasByYear.set(delta.year, delta);
  });

  for (let year = world.meta.startYear; year <= world.meta.endYear; year += 1) {
    const delta = deltasByYear.get(year);
    if (delta) {
      for (const update of delta.polityUpdates) {
        const stats = statsByPolity.get(update.polityId);
        if (!stats) continue;
        for (const [key, value] of Object.entries(update.statsDelta)) {
          const typedKey = key as keyof PolityStats;
          const deltaValue = value ?? 0;
          (stats[typedKey] as number) += deltaValue as number;
        }
      }
    }
    for (const [polityId, stats] of statsByPolity) {
      polityStatsSeries.get(polityId)?.push({ year, stats: summarizeStats(stats) });
    }
  }

  return {
    eventsByYear,
    eventsByPolity,
    changesByPolity,
    changesByYear,
    eventsById,
    changesById,
    warsById,
    searchEntries,
    searchTokenMap,
    polityStatsSeries
  };
}

const intersectIndices = (a: number[], b: number[]): number[] => {
  const setB = new Set(b);
  return a.filter((value) => setB.has(value));
};

export function searchWorldIndexes(indexes: WorldIndexes, query: string, limit = 20): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  let candidateIndices: number[] | null = null;
  for (const token of tokens) {
    const indices = indexes.searchTokenMap.get(token) ?? [];
    candidateIndices = candidateIndices ? intersectIndices(candidateIndices, indices) : [...indices];
  }
  if (!candidateIndices || candidateIndices.length === 0) return [];
  const queryLower = query.toLowerCase();
  const results = candidateIndices
    .map((index) => indexes.searchEntries[index])
    .filter((entry) => entry.haystack.includes(queryLower))
    .sort((a, b) => {
      const yearA = a.year ?? Number.POSITIVE_INFINITY;
      const yearB = b.year ?? Number.POSITIVE_INFINITY;
      if (yearA !== yearB) return yearA - yearB;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      if (a.title !== b.title) return a.title.localeCompare(b.title);
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit)
    .map((entry) => ({ kind: entry.kind, id: entry.id, year: entry.year, title: entry.title, snippet: entry.snippet }));
  return results;
}

export function serializeWorldIndexes(indexes: WorldIndexes) {
  const mapToObject = <T>(map: Map<string | number, T>) => Object.fromEntries(map.entries());
  return {
    eventsByYear: mapToObject(indexes.eventsByYear),
    eventsByPolity: mapToObject(indexes.eventsByPolity),
    changesByPolity: mapToObject(indexes.changesByPolity),
    changesByYear: mapToObject(indexes.changesByYear),
    searchEntries: indexes.searchEntries.map(({ kind, id, year, title }) => ({ kind, id, year, title })),
    polityStatsSeries: mapToObject(indexes.polityStatsSeries)
  };
}
