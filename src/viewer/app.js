const defaultConfig = `{
  "seed": 101,
  "planet": {
    "radiusKm": 6371,
    "oceanCoverage": 0.66,
    "numContinents": 3,
    "mapWidth": 120,
    "mapHeight": 60,
    "tectonicsMode": "lite",
    "climateModel": "koppen-lite"
  },
  "societies": {
    "numCultureGroups": 25,
    "numCitiesTarget": 60,
    "numPolitiesTarget": 60,
    "startingYear": 0,
    "endingYear": 500,
    "techPace": "medium",
    "migrationIntensity": 0.3
  },
  "geopolitics": {
    "aggression": 0.45,
    "diplomacyBias": 0.55,
    "coalitionTendency": 0.5,
    "imperialOverreachPenalty": 0.5,
    "resourceNeedWeight": 0.45,
    "culturalAffinityWeight": 0.5,
    "warCostModel": "logistics-terrain",
    "annexationRules": {
      "allowVassalization": true,
      "allowFullAbsorb": true,
      "maxAnnexationPerDecadePct": 0.15
    }
  },
  "output": {
    "detail": "standard",
    "snapshotsEveryYears": 10,
    "exportFormats": ["json", "csv", "geojson"]
  }
}`;

class LRUCache {
  constructor(limit) {
    this.limit = limit;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
}

const state = {
  worlds: [],
  worldId: null,
  world: null,
  year: null,
  layer: 'political',
  mapCache: new LRUCache(200),
  ownerCache: new Map(),
  polityById: new Map(),
  selectedPolityId: null,
  selectedWarId: null,
  selectedChangeId: null,
  selectedEventId: null,
  mapIndexByCoord: null,
  lastRenderKey: null,
  highlightCellId: null,
  overlayMode: null,
  searchActiveIndex: 0
};

const elements = {
  refreshWorlds: document.getElementById('refresh-worlds'),
  worldSelect: document.getElementById('world-select'),
  worldMeta: document.getElementById('world-meta'),
  emptyWorld: document.getElementById('empty-world'),
  generateConfig: document.getElementById('generate-config'),
  generateWorld: document.getElementById('generate-world'),
  yearSlider: document.getElementById('year-slider'),
  yearInput: document.getElementById('year-input'),
  yearValue: document.getElementById('year-value'),
  timelineHeatmap: document.getElementById('timeline-heatmap'),
  eventsGroups: document.getElementById('events-groups'),
  ledgerPolity: document.getElementById('ledger-polity'),
  ledgerType: document.getElementById('ledger-type'),
  ledgerFrom: document.getElementById('ledger-from'),
  ledgerTo: document.getElementById('ledger-to'),
  ledgerRefresh: document.getElementById('ledger-refresh'),
  ledgerTable: document.getElementById('ledger-table'),
  topPowersDecade: document.getElementById('top-powers-decade'),
  topPowersList: document.getElementById('top-powers-list'),
  storyCard: document.getElementById('story-card'),
  tabButtons: document.querySelectorAll('.tab-button'),
  tabPolity: document.getElementById('tab-polity'),
  tabWar: document.getElementById('tab-war'),
  tabChange: document.getElementById('tab-change'),
  searchInput: document.getElementById('global-search'),
  searchResults: document.getElementById('search-results'),
  layerSelect: document.getElementById('layer-select'),
  focusPolity: document.getElementById('focus-polity'),
  showChange: document.getElementById('show-change'),
  canvas: document.getElementById('map-canvas'),
  tooltip: document.getElementById('map-tooltip'),
  mapNotes: document.getElementById('map-notes')
};

const ctx = elements.canvas.getContext('2d');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fnv1a = (value) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const hslToRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else if (hp <= 6) [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
};

const polityColor = (id) => {
  const hash = fnv1a(id);
  const hue = hash % 360;
  return hslToRgb(hue, 0.55, 0.55);
};

const biomeColor = (id) => {
  const hash = fnv1a(id);
  const hue = hash % 360;
  return hslToRgb(hue, 0.45, 0.5);
};

const formatNumber = (value) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(2);
  }
  return String(value);
};

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const mapKey = (layer, year) => `${state.worldId}:${layer}:${year}`;

const decodePoliticalOwners = (rle, length) => {
  const owners = new Array(length).fill('');
  for (const entry of rle) {
    for (const range of entry.ranges) {
      for (let idx = range.start; idx <= range.end; idx += 1) {
        owners[idx] = entry.owner;
      }
    }
  }
  return owners;
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return response.json();
};

const buildCoordIndex = (world) => {
  const index = new Array(world.planet.mapWidth * world.planet.mapHeight).fill(-1);
  world.cells.forEach((cell, idx) => {
    const pos = cell.y * world.planet.mapWidth + cell.x;
    index[pos] = idx;
  });
  return index;
};

const getOwnerMap = async () => {
  const key = mapKey('political', state.year);
  const cached = state.mapCache.get(key);
  if (cached) return cached;
  const rle = await fetchJson(`/world/${state.worldId}/map?layer=political&year=${state.year}`);
  const owners = decodePoliticalOwners(rle, state.world.cells.length);
  state.mapCache.set(key, owners);
  return owners;
};

const getLayerData = async (layer) => {
  const key = mapKey(layer, state.year);
  const cached = state.mapCache.get(key);
  if (cached) return cached;
  const data = await fetchJson(`/world/${state.worldId}/map?layer=${layer}&year=${state.year}`);
  state.mapCache.set(key, data);
  return data;
};

const renderMap = async () => {
  if (!state.world) return;
  const renderKey = `${state.worldId}:${state.layer}:${state.year}:${state.overlayMode}:${state.selectedPolityId}:${state.selectedChangeId}`;
  if (state.lastRenderKey === renderKey) return;
  state.lastRenderKey = renderKey;

  const width = state.world.planet.mapWidth;
  const height = state.world.planet.mapHeight;
  const image = ctx.createImageData(width, height);
  const data = image.data;

  const layer = state.layer;
  let layerData = null;
  if (layer === 'political') {
    layerData = await getOwnerMap();
  } else {
    layerData = await getLayerData(layer);
  }
  const owners = layer === 'political' ? layerData : await getOwnerMap();

  let elevMin = 0;
  let elevMax = 1;
  if (layer === 'elevation') {
    elevMin = Infinity;
    elevMax = -Infinity;
    for (const value of layerData) {
      if (value < elevMin) elevMin = value;
      if (value > elevMax) elevMax = value;
    }
  }

  state.world.cells.forEach((cell, idx) => {
    const baseIndex = (cell.y * width + cell.x) * 4;
    let color = [30, 30, 30];
    if (layer === 'political') {
      if (cell.isOcean) {
        color = [20, 60, 120];
      } else {
        const owner = layerData[idx];
        color = owner ? polityColor(owner) : [90, 90, 90];
      }
    } else if (layer === 'biome') {
      color = biomeColor(layerData[idx]);
    } else if (layer === 'elevation') {
      const normalized = (layerData[idx] - elevMin) / (elevMax - elevMin || 1);
      const shade = Math.round(normalized * 255);
      color = [shade, shade, shade];
    } else if (layer === 'resources') {
      color = cell.isOcean ? [20, 60, 120] : [50, 55, 65];
    }

    data[baseIndex] = color[0];
    data[baseIndex + 1] = color[1];
    data[baseIndex + 2] = color[2];
    data[baseIndex + 3] = 255;
  });

  ctx.putImageData(image, 0, 0);

  if (layer === 'resources') {
    ctx.fillStyle = 'rgba(0, 255, 153, 0.8)';
    state.world.cells.forEach((cell) => {
      const tags = cell.resourceTags;
      if (tags && tags.length > 0) {
        ctx.fillRect(cell.x, cell.y, 1, 1);
      }
    });
  }

  if (state.overlayMode === 'polity' && state.selectedPolityId) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let idx = 0; idx < owners.length; idx += 1) {
      if (owners[idx] !== state.selectedPolityId) continue;
      const cell = state.world.cells[idx];
      const neighbors = [
        idx - 1,
        idx + 1,
        idx - width,
        idx + width
      ];
      const border = neighbors.some((n) => n < 0 || n >= owners.length || owners[n] !== state.selectedPolityId);
      if (border) {
        ctx.fillRect(cell.x, cell.y, 1, 1);
      }
    }
  }

  if (state.overlayMode === 'change' && state.selectedChangeId) {
    const change = state.world.territorialChanges.find((c) => c.id === state.selectedChangeId);
    if (change) {
      ctx.fillStyle = 'rgba(94, 228, 199, 0.9)';
      change.regionsTransferredCompressed.forEach((range) => {
        for (let idx = range.start; idx <= range.end; idx += 1) {
          const cell = state.world.cells[idx];
          if (cell) ctx.fillRect(cell.x, cell.y, 1, 1);
        }
      });
    }
  }

  if (state.highlightCellId !== null) {
    const cell = state.world.cells[state.highlightCellId];
    if (cell) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1;
      ctx.strokeRect(cell.x - 1, cell.y - 1, 3, 3);
    }
  }
};

const renderWorldMeta = (worldId) => {
  const entry = state.worlds.find((w) => w.worldId === worldId);
  if (!entry) return;
  elements.worldMeta.textContent = `Seed ${entry.meta.seed} · Years ${entry.meta.startYear}-${entry.meta.endYear} · Hash ${entry.meta.configHash}`;
};

const loadWorlds = async () => {
  const data = await fetchJson('/worlds');
  state.worlds = data;
  elements.worldSelect.innerHTML = '';
  if (data.length === 0) {
    elements.emptyWorld.hidden = false;
    elements.worldSelect.innerHTML = '<option value="">No worlds loaded</option>';
    elements.worldMeta.textContent = 'Generate a world to begin.';
    return;
  }
  elements.emptyWorld.hidden = true;
  data.forEach((world) => {
    const option = document.createElement('option');
    option.value = world.worldId;
    option.textContent = `${world.worldId.slice(0, 8)} · ${world.meta.startYear} → ${world.meta.endYear}`;
    elements.worldSelect.appendChild(option);
  });
  if (!state.worldId || !data.find((w) => w.worldId === state.worldId)) {
    state.worldId = data[0].worldId;
  }
  elements.worldSelect.value = state.worldId;
};

const loadWorld = async (worldId) => {
  if (!worldId) return;
  const world = await fetchJson(`/world/${worldId}/export`);
  state.world = world;
  state.worldId = worldId;
  state.mapCache = new LRUCache(200);
  state.ownerCache = new Map();
  state.mapIndexByCoord = buildCoordIndex(world);
  state.year = world.meta.startYear;
  state.highlightCellId = null;
  state.selectedPolityId = null;
  state.selectedWarId = null;
  state.selectedChangeId = null;
  state.selectedEventId = null;
  elements.yearSlider.min = String(world.meta.startYear);
  elements.yearSlider.max = String(world.meta.endYear);
  elements.yearSlider.value = String(state.year);
  elements.yearInput.value = String(state.year);
  elements.yearValue.textContent = String(state.year);
  elements.canvas.width = world.planet.mapWidth;
  elements.canvas.height = world.planet.mapHeight;
  elements.mapNotes.textContent = `Map: ${world.planet.mapWidth} × ${world.planet.mapHeight} cells.`;
  renderWorldMeta(worldId);
  populatePolityIndex();
  populateLedgerFilters();
  populateTopPowers();
  await refreshHeatmap();
  await refreshYear();
};

const populatePolityIndex = () => {
  if (!state.world) return;
  state.polityById = new Map(state.world.politiesInitial.map((p) => [p.id, p]));
};

const populateLedgerFilters = () => {
  if (!state.world) return;
  elements.ledgerPolity.innerHTML = '<option value="">All</option>';
  state.world.politiesInitial.forEach((polity) => {
    const option = document.createElement('option');
    option.value = polity.id;
    option.textContent = polity.name;
    elements.ledgerPolity.appendChild(option);
  });
  const types = Array.from(new Set(state.world.territorialChanges.map((change) => change.type)));
  elements.ledgerType.innerHTML = '<option value="">All</option>';
  types.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    elements.ledgerType.appendChild(option);
  });
  elements.ledgerFrom.value = String(state.world.meta.startYear);
  elements.ledgerTo.value = String(state.world.meta.endYear);
};

const populateTopPowers = () => {
  if (!state.world) return;
  elements.topPowersDecade.innerHTML = '';
  state.world.meta.summary.topPowersByDecade.forEach((entry) => {
    const option = document.createElement('option');
    option.value = String(entry.decade);
    option.textContent = `${entry.decade}s`;
    elements.topPowersDecade.appendChild(option);
  });
  elements.topPowersDecade.onchange = () => renderTopPowers();
  renderTopPowers();
};

const renderTopPowers = () => {
  const decade = Number(elements.topPowersDecade.value);
  const entry = state.world.meta.summary.topPowersByDecade.find((item) => item.decade === decade);
  if (!entry) return;
  elements.topPowersList.innerHTML = '';
  entry.top.forEach((item, index) => {
    const name = state.polityById.get(item.id)?.name ?? item.id;
    const row = document.createElement('div');
    row.className = 'list-item';
    row.textContent = `${index + 1}. ${name} · Power ${formatNumber(item.powerScore)}`;
    elements.topPowersList.appendChild(row);
  });
};

const refreshHeatmap = async () => {
  if (!state.world) return;
  const data = await fetchJson(`/world/${state.worldId}/years/summary?from=${state.world.meta.startYear}&to=${state.world.meta.endYear}`);
  elements.timelineHeatmap.innerHTML = '';
  data.forEach((entry) => {
    const total = Object.values(entry.counts).reduce((sum, value) => sum + value, 0);
    const intensity = Math.min(1, total / 5);
    const item = document.createElement('div');
    item.className = 'heat-item';
    item.style.background = `rgba(94, 228, 199, ${0.2 + intensity * 0.8})`;
    item.title = `${entry.year}: ${total} events`;
    item.addEventListener('click', () => setYear(entry.year));
    elements.timelineHeatmap.appendChild(item);
  });
};

const eventGroupMap = [
  { label: 'Wars & Battles', types: ['WAR_DECLARED', 'WAR_ENDED', 'BATTLE'] },
  { label: 'Treaties & Alliances', types: ['TREATY_SIGNED', 'ALLIANCE_FORMED'] },
  { label: 'Annexations / Absorptions', types: ['ANNEXATION', 'ABSORPTION', 'ANNEXATION_PARTIAL', 'ABSORBED_FULL', 'VASSALIZED', 'UNION', 'SECESSION'] },
  { label: 'Internal crises', types: ['REVOLT', 'SECESSION', 'CRISIS'] },
  { label: 'Economy / Tech', types: ['ECONOMY', 'TECH'] }
];

const renderEventsForYear = (events) => {
  elements.eventsGroups.innerHTML = '';
  const grouped = new Map(eventGroupMap.map((group) => [group.label, []]));
  const other = [];
  events.forEach((event) => {
    const group = eventGroupMap.find((g) => g.types.includes(event.type));
    if (group) grouped.get(group.label).push(event);
    else other.push(event);
  });
  if (other.length) grouped.set('Other', other);

  grouped.forEach((items, label) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'event-group';
    groupEl.innerHTML = `<h4>${label}</h4>`;
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'event-item';
      empty.textContent = 'No events.';
      groupEl.appendChild(empty);
    } else {
      items.forEach((event) => {
        const item = document.createElement('div');
        item.className = 'event-item';
        item.innerHTML = `<strong>${event.year}</strong> · ${event.title}`;
        item.addEventListener('click', () => selectEvent(event));
        groupEl.appendChild(item);
      });
    }
    elements.eventsGroups.appendChild(groupEl);
  });
};

const selectEvent = (event) => {
  state.selectedEventId = event.id;
  renderStoryCard(event);
  if (event.refs?.warId) {
    state.selectedWarId = event.refs.warId;
    refreshWarInspector();
  }
  if (event.refs?.changeId) {
    state.selectedChangeId = event.refs.changeId;
    refreshChangeInspector();
  }
};

const renderStoryCard = (event) => {
  if (!event) {
    elements.storyCard.textContent = 'Select an event to see its story.';
    return;
  }
  const actors = [...event.actors.primary, ...(event.actors.secondary ?? [])]
    .map((id) => state.polityById.get(id)?.name ?? id)
    .join(', ');
  const causes = event.causes.map((cause) => `${cause.key} (${(cause.weight * 100).toFixed(0)}%)`).join(', ') || 'None';
  const effects = event.effects.join(', ') || 'None';
  const links = [];
  if (event.refs?.warId) links.push(`<span class="pill" data-war="${event.refs.warId}">War ${event.refs.warId}</span>`);
  if (event.refs?.treatyId) links.push(`<span class="pill" data-treaty="${event.refs.treatyId}">Treaty ${event.refs.treatyId}</span>`);
  if (event.refs?.changeId) links.push(`<span class="pill" data-change="${event.refs.changeId}">Change ${event.refs.changeId}</span>`);
  elements.storyCard.innerHTML = `
    <h3>${event.title}</h3>
    <div>${event.explanation.slice(0, 3).join(' ')}</div>
    <div><strong>Who:</strong> ${actors || 'Unknown'}</div>
    <div><strong>Why:</strong> ${causes}</div>
    <div><strong>What changed:</strong> ${effects}</div>
    <div class="links">${links.join(' ')}</div>
  `;
  elements.storyCard.querySelectorAll('[data-war]').forEach((node) => {
    node.addEventListener('click', () => {
      state.selectedWarId = node.getAttribute('data-war');
      activateTab('war');
      refreshWarInspector();
    });
  });
  elements.storyCard.querySelectorAll('[data-change]').forEach((node) => {
    node.addEventListener('click', () => {
      state.selectedChangeId = node.getAttribute('data-change');
      activateTab('change');
      refreshChangeInspector();
      state.overlayMode = 'change';
      renderMap();
    });
  });
};

const sparkline = (values, width = 120, height = 30) => {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (max - min || 1)) * height;
      return `${x},${y}`;
    })
    .join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <polyline fill="none" stroke="#5ee4c7" stroke-width="2" points="${points}" />
  </svg>`;
};

const refreshPolityInspector = async () => {
  if (!state.selectedPolityId) {
    elements.tabPolity.innerHTML = '<p class="hint">Select a polity on the map to inspect.</p>';
    return;
  }
  const from = Math.max(state.world.meta.startYear, state.year - 50);
  const history = await fetchJson(`/world/${state.worldId}/polity/${state.selectedPolityId}/history?from=${from}&to=${state.year}`);
  const latest = history.statsSeries[history.statsSeries.length - 1];
  if (!latest) return;
  const stats = latest.stats;
  const series = history.statsSeries;
  const values = (key) => series.map((point) => point.stats[key]);
  const eventList = history.events
    .map((event) => ({
      event,
      score: event.causes.length + event.effects.length + event.explanation.length
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => `<div class="list-item">${item.event.year} · ${item.event.title}</div>`)
    .join('');
  const changeList = history.changes
    .map((change) => {
      const winner = state.polityById.get(change.winnerPolityId)?.name ?? change.winnerPolityId ?? '-';
      const loser = state.polityById.get(change.loserPolityId)?.name ?? change.loserPolityId ?? '-';
      return `<div class="list-item">${change.year} · ${change.type} · ${winner} → ${loser}</div>`;
    })
    .join('');

  elements.tabPolity.innerHTML = `
    <div><strong>${state.polityById.get(state.selectedPolityId)?.name ?? state.selectedPolityId}</strong></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Power</div><div class="value">${formatNumber(stats.powerScore)}</div>${sparkline(values('powerScore'))}</div>
      <div class="stat-card"><div class="label">Population</div><div class="value">${formatNumber(stats.population)}</div>${sparkline(values('population'))}</div>
      <div class="stat-card"><div class="label">GDP</div><div class="value">${formatNumber(stats.gdp)}</div>${sparkline(values('gdp'))}</div>
      <div class="stat-card"><div class="label">Tech</div><div class="value">${formatNumber(stats.techLevel)}</div>${sparkline(values('techLevel'))}</div>
      <div class="stat-card"><div class="label">Stability</div><div class="value">${formatNumber(stats.stability)}</div>${sparkline(values('stability'))}</div>
      <div class="stat-card"><div class="label">Military</div><div class="value">${formatNumber(stats.military)}</div>${sparkline(values('military'))}</div>
    </div>
    <h4>Key history</h4>
    <div class="list">${eventList || '<div class="list-item">No events.</div>'}</div>
    <h4>Territory changes</h4>
    <div class="list">${changeList || '<div class="list-item">No changes.</div>'}</div>
  `;
};

const refreshWarInspector = async () => {
  if (!state.selectedWarId) {
    elements.tabWar.innerHTML = '<p class="hint">Select a war to inspect.</p>';
    return;
  }
  const war = await fetchJson(`/world/${state.worldId}/war/${state.selectedWarId}`);
  const getName = (id) => state.polityById.get(id)?.name ?? id;
  const battles = war.battles
    .map(
      (battle) => `
        <div class="list-item" data-cell="${battle.locationCellId}">
          ${battle.year} · ${battle.type} · ${battle.result}
          <div class="hint">Cell ${battle.locationCellId} · Casualties A ${battle.casualtiesEstimate.A} / B ${battle.casualtiesEstimate.B}</div>
        </div>`
    )
    .join('');
  const causeChain = state.world.events
    .filter((event) => event.refs?.warId === war.id)
    .map((event) => `<div class="list-item">${event.year} · ${event.title}</div>`)
    .join('');
  elements.tabWar.innerHTML = `
    <div><strong>${war.name}</strong> (${war.startYear}-${war.endYear ?? 'ongoing'})</div>
    <div>Sides: A [${war.sides.A.map(getName).join(', ')}] vs B [${war.sides.B.map(getName).join(', ')}]</div>
    <div>Outcome: ${war.outcome}</div>
    <div>Treaty: ${war.treatyId ?? 'None'}</div>
    <h4>Battles</h4>
    <div class="list">${battles || '<div class="list-item">No battles recorded.</div>'}</div>
    <h4>Cause chain</h4>
    <div class="list">${causeChain || '<div class="list-item">No cause chain recorded.</div>'}</div>
  `;
  elements.tabWar.querySelectorAll('[data-cell]').forEach((node) => {
    node.addEventListener('click', () => {
      const cellId = Number(node.getAttribute('data-cell'));
      if (Number.isFinite(cellId)) {
        state.highlightCellId = cellId;
        renderMap();
      }
    });
  });
};

const refreshChangeInspector = () => {
  if (!state.selectedChangeId) {
    elements.tabChange.innerHTML = '<p class="hint">Select a territorial change to inspect.</p>';
    return;
  }
  const change = state.world.territorialChanges.find((c) => c.id === state.selectedChangeId);
  if (!change) return;
  const winner = state.polityById.get(change.winnerPolityId)?.name ?? change.winnerPolityId ?? '-';
  const loser = state.polityById.get(change.loserPolityId)?.name ?? change.loserPolityId ?? '-';
  elements.tabChange.innerHTML = `
    <div><strong>${change.type}</strong> (${change.year})</div>
    <div>Winner: ${winner}</div>
    <div>Loser: ${loser}</div>
    <div>Reason: ${change.reason}</div>
    <div>Linked war: ${change.linkedWarId ?? 'None'}</div>
    <div>Treaty: ${change.treatyId ?? 'None'}</div>
    <div>Cells transferred: ${change.regionsTransferredCompressed.length}</div>
  `;
};

const refreshEvents = async () => {
  if (!state.world) return;
  const events = await fetchJson(`/world/${state.worldId}/timeline?from=${state.year}&to=${state.year}`);
  renderEventsForYear(events);
};

const refreshLedger = async () => {
  if (!state.world) return;
  const from = Number(elements.ledgerFrom.value) || state.world.meta.startYear;
  const to = Number(elements.ledgerTo.value) || state.world.meta.endYear;
  const type = elements.ledgerType.value;
  const data = await fetchJson(`/world/${state.worldId}/changes?from=${from}&to=${to}${type ? `&type=${type}` : ''}`);
  const polityFilter = elements.ledgerPolity.value;
  const filtered = polityFilter
    ? data.filter((change) => change.winnerPolityId === polityFilter || change.loserPolityId === polityFilter)
    : data;
  elements.ledgerTable.innerHTML = '';
  filtered.forEach((change) => {
    const row = document.createElement('div');
    row.className = 'ledger-row';
    const winner = state.polityById.get(change.winnerPolityId)?.name ?? change.winnerPolityId ?? '-';
    const loser = state.polityById.get(change.loserPolityId)?.name ?? change.loserPolityId ?? '-';
    row.innerHTML = `
      <div>${change.year}</div>
      <div>${winner}</div>
      <div>${loser}</div>
      <div>${change.type}</div>
      <div>${change.linkedWarId ?? change.treatyId ?? '—'}</div>
    `;
    row.addEventListener('click', () => {
      state.selectedChangeId = change.id;
      activateTab('change');
      refreshChangeInspector();
      state.overlayMode = 'change';
      renderMap();
    });
    elements.ledgerTable.appendChild(row);
  });
};

const refreshYear = async () => {
  elements.yearValue.textContent = String(state.year);
  elements.yearInput.value = String(state.year);
  await refreshEvents();
  await refreshPolityInspector();
  await renderMap();
};

let sliderTimeout = null;

const setYear = (year) => {
  if (!state.world) return;
  const clamped = Math.min(state.world.meta.endYear, Math.max(state.world.meta.startYear, year));
  state.year = clamped;
  elements.yearSlider.value = String(clamped);
  elements.yearInput.value = String(clamped);
  if (sliderTimeout) clearTimeout(sliderTimeout);
  sliderTimeout = setTimeout(() => {
    refreshYear();
  }, 100);
};

const handleCanvasMove = async (event) => {
  if (!state.world) return;
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = state.world.planet.mapWidth / rect.width;
  const scaleY = state.world.planet.mapHeight / rect.height;
  const x = Math.floor((event.clientX - rect.left) * scaleX);
  const y = Math.floor((event.clientY - rect.top) * scaleY);
  if (x < 0 || y < 0 || x >= state.world.planet.mapWidth || y >= state.world.planet.mapHeight) {
    elements.tooltip.hidden = true;
    return;
  }
  const index = state.mapIndexByCoord[y * state.world.planet.mapWidth + x];
  if (index === -1) return;
  const cell = state.world.cells[index];
  const owners = await getOwnerMap();
  const ownerId = owners[index];
  const ownerName = ownerId ? state.polityById.get(ownerId)?.name ?? ownerId : 'Unclaimed';
  elements.tooltip.hidden = false;
  elements.tooltip.style.left = `${event.clientX - rect.left + 10}px`;
  elements.tooltip.style.top = `${event.clientY - rect.top + 10}px`;
  elements.tooltip.innerHTML = `
    <strong>Cell ${cell.x},${cell.y}</strong><br/>
    Lat/Lon: ${cell.lat.toFixed(2)}, ${cell.lon.toFixed(2)}<br/>
    Biome: ${cell.biomeId}<br/>
    Elevation: ${cell.elevation.toFixed(2)}<br/>
    Ocean: ${cell.isOcean ? 'Yes' : 'No'}<br/>
    Owner: ${ownerName}
  `;
};

const handleCanvasLeave = () => {
  elements.tooltip.hidden = true;
};

const handleCanvasClick = async (event) => {
  if (!state.world) return;
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = state.world.planet.mapWidth / rect.width;
  const scaleY = state.world.planet.mapHeight / rect.height;
  const x = Math.floor((event.clientX - rect.left) * scaleX);
  const y = Math.floor((event.clientY - rect.top) * scaleY);
  const index = state.mapIndexByCoord[y * state.world.planet.mapWidth + x];
  if (index === -1) return;
  const owners = await getOwnerMap();
  const ownerId = owners[index];
  if (!ownerId) return;
  state.selectedPolityId = ownerId;
  activateTab('polity');
  refreshPolityInspector();
};

const activateTab = (tabId) => {
  elements.tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.toggle('active', tab.id === `tab-${tabId}`);
  });
};

const renderSearchResults = (results) => {
  elements.searchResults.innerHTML = '';
  state.searchActiveIndex = 0;
  if (results.length === 0) {
    elements.searchResults.hidden = true;
    return;
  }
  const groups = results.reduce((acc, result) => {
    const key = result.kind;
    if (!acc[key]) acc[key] = [];
    acc[key].push(result);
    return acc;
  }, {});

  Object.entries(groups).forEach(([kind, items]) => {
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = kind.toUpperCase();
    elements.searchResults.appendChild(title);
    items.forEach((result, index) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      if (index === 0) item.classList.add('active');
      item.textContent = `${result.title}${result.year ? ` · ${result.year}` : ''}`;
      item.addEventListener('click', () => openSearchResult(result));
      elements.searchResults.appendChild(item);
    });
  });
  elements.searchResults.hidden = false;
};

const openSearchResult = (result) => {
  elements.searchResults.hidden = true;
  if (result.kind === 'polity') {
    state.selectedPolityId = result.id;
    activateTab('polity');
    refreshPolityInspector();
  } else if (result.kind === 'war') {
    state.selectedWarId = result.id;
    activateTab('war');
    refreshWarInspector();
  } else if (result.kind === 'change') {
    state.selectedChangeId = result.id;
    activateTab('change');
    refreshChangeInspector();
    state.overlayMode = 'change';
    renderMap();
  } else if (result.kind === 'event') {
    const event = state.world.events.find((e) => e.id === result.id);
    if (event) selectEvent(event);
  }
};

const runSearch = debounce(async () => {
  const query = elements.searchInput.value.trim();
  if (!query) {
    elements.searchResults.hidden = true;
    return;
  }
  if (!state.worldId) return;
  try {
    const results = await fetchJson(`/world/${state.worldId}/events/search?q=${encodeURIComponent(query)}&limit=40`);
    renderSearchResults(results);
  } catch (error) {
    console.error(error);
  }
}, 200);

const init = async () => {
  elements.generateConfig.value = defaultConfig;

  elements.refreshWorlds.addEventListener('click', async () => {
    await loadWorlds();
    if (state.worldId) await loadWorld(state.worldId);
  });

  elements.worldSelect.addEventListener('change', async (event) => {
    const target = event.target;
    if (!target.value) return;
    await loadWorld(target.value);
  });

  elements.generateWorld.addEventListener('click', async () => {
    const raw = elements.generateConfig.value;
    let config;
    try {
      config = JSON.parse(raw);
    } catch (error) {
      alert('Invalid JSON configuration');
      return;
    }
    elements.generateWorld.disabled = true;
    try {
      const response = await fetchJson('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      await sleep(100);
      await loadWorlds();
      state.worldId = response.worldId;
      elements.worldSelect.value = response.worldId;
      await loadWorld(response.worldId);
    } catch (error) {
      alert(`Failed to generate: ${error.message}`);
    } finally {
      elements.generateWorld.disabled = false;
    }
  });

  elements.yearSlider.addEventListener('input', (event) => {
    setYear(Number(event.target.value));
  });

  elements.yearInput.addEventListener('change', (event) => {
    setYear(Number(event.target.value));
  });

  document.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const step = Number(button.getAttribute('data-step'));
      setYear(state.year + step);
    });
  });

  elements.layerSelect.addEventListener('change', async (event) => {
    state.layer = event.target.value;
    state.lastRenderKey = null;
    await renderMap();
  });

  elements.focusPolity.addEventListener('click', () => {
    state.overlayMode = state.overlayMode === 'polity' ? null : 'polity';
    renderMap();
  });

  elements.showChange.addEventListener('click', () => {
    state.overlayMode = state.overlayMode === 'change' ? null : 'change';
    renderMap();
  });

  elements.canvas.addEventListener('mousemove', handleCanvasMove);
  elements.canvas.addEventListener('mouseleave', handleCanvasLeave);
  elements.canvas.addEventListener('click', handleCanvasClick);

  elements.ledgerRefresh.addEventListener('click', refreshLedger);

  elements.searchInput.addEventListener('input', runSearch);
  elements.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const first = elements.searchResults.querySelector('.result-item');
      if (first) first.click();
    }
    if (event.key === 'Escape') {
      elements.searchResults.hidden = true;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/') {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.key === 'Escape') {
      elements.searchResults.hidden = true;
    }
  });

  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  await loadWorlds();
  if (state.worldId) await loadWorld(state.worldId);
  refreshLedger();
};

init().catch((error) => {
  console.error(error);
});
