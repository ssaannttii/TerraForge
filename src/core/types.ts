export type Range = { start: number; end: number };

export type Cell = {
  id: number;
  x: number;
  y: number;
  lat: number;
  lon: number;
  elevation: number;
  isOcean: boolean;
  riverId?: number;
  biomeId: string;
  resourceTags: string[];
};

export type Continent = {
  id: string;
  name: string;
  cellIds: number[];
};

export type CultureGroup = {
  id: string;
  name: string;
  traits: Record<string, number>;
  coreRegionIds: number[];
};

export type City = {
  id: string;
  name: string;
  cellId: number;
  population: number;
  coastal: boolean;
  river: boolean;
  cultureGroupId: string;
};

export type PolityType = 'kingdom' | 'republic' | 'empire' | 'city-state' | 'tribal' | 'federation';

export type PolityStats = {
  population: number;
  gdp: number;
  techLevel: number;
  industrialCapacity: number;
  resourceSecurity: number;
  military: number;
  navalProjection: number;
  stability: number;
  legitimacy: number;
  logistics: number;
  powerScore: number;
};

export type PolityState = {
  id: string;
  name: string;
  type: PolityType;
  capitalCityId: string;
  cultureGroupIds: string[];
  stats: PolityStats;
  territory: {
    cellIdsCompressed: Range[];
  };
};

export type TimelineEvent = {
  id: string;
  year: number;
  type: string;
  title: string;
  actors: { primary: string[]; secondary?: string[] };
  causes: { key: string; weight: number; ref?: string }[];
  effects: string[];
  explanation: string[];
  refs: { warId?: string; treatyId?: string; changeId?: string; battleId?: string };
};

export type Battle = {
  id: string;
  year: number;
  locationCellId: number;
  type: 'FIELD' | 'SIEGE' | 'NAVAL';
  result: 'A_VICTORY' | 'B_VICTORY' | 'INDECISIVE';
  casualtiesEstimate: { A: number; B: number };
  factors: string[];
  explanation: string[];
};

export type War = {
  id: string;
  name: string;
  startYear: number;
  endYear?: number;
  sides: { A: string[]; B: string[] };
  theaters?: string[];
  battles: Battle[];
  outcome: 'A_WIN' | 'B_WIN' | 'DRAW' | 'WHITE_PEACE';
  treatyId?: string;
  territorialChanges: string[];
  explanation: string[];
};

export type Treaty = {
  id: string;
  name: string;
  year: number;
  participants: string[];
  terms: string[];
};

export type TerritorialChange = {
  id: string;
  year: number;
  type: 'ANNEXATION_PARTIAL' | 'ABSORBED_FULL' | 'VASSALIZED' | 'SECESSION' | 'COLONIZATION' | 'UNION';
  winnerPolityId?: string;
  loserPolityId?: string;
  regionsTransferredCompressed: Range[];
  reason: string;
  linkedWarId?: string;
  treatyId?: string;
};

export type Snapshot = {
  year: number;
  polityStates: PolityState[];
  politicalOwnersRLE: { owner: string; ranges: Range[] }[];
  alliances: string[][];
};

export type Delta = {
  year: number;
  polityUpdates: { polityId: string; statsDelta: Partial<PolityStats> }[];
  territorialChangeIds: string[];
  events: string[];
};

export type TimelineIndex = {
  snapshots: Snapshot[];
  deltasBetweenSnapshots: Delta[];
};

export type WorldMeta = {
  seed: number;
  configHash: string;
  createdAtIso: string;
  startYear: number;
  endYear: number;
  tick: 'year';
  version: string;
  summary: {
    topPowersByDecade: { decade: number; top: { id: string; powerScore: number }[] }[];
    totals: { wars: number; battles: number; annexations: number; secessions: number };
    eras: { name: string; start: number; end: number; reason: string }[];
  };
};

export type WorldBundle = {
  meta: WorldMeta;
  planet: { radiusKm: number; oceanCoverage: number; mapWidth: number; mapHeight: number };
  cells: Cell[];
  continents: Continent[];
  cultureGroups: CultureGroup[];
  cities: City[];
  politiesInitial: PolityState[];
  timelineIndex: TimelineIndex;
  events: TimelineEvent[];
  wars: War[];
  treaties: Treaty[];
  territorialChanges: TerritorialChange[];
};
