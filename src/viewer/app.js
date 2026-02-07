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
  worldMeta: null,
  planet: null,
  cells: null,
  year: null,
  layer: 'political',
  summaryByYear: new Map(),
  wars: [],
  politiesById: new Map(),
  mapCache: new LRUCache(200),
  ownerCache: new Map(),
  selectedPolityId: null,
  selectedWarId: null,
  selectedChangeId: null,
  selectedEventId: null,
  selectedChange: null,
  selectedEvent: null,
  highlightCellId: null,
  searchActiveIndex: 0
};

const elements = {
  refreshWorlds: document.getElementById('refresh-worlds'),
  worldSelect: document.getElementById('world-select'),
  worldMeta: document.getElementById('world-meta'),
  emptyWorld: document.getElementById('empty-world'),
  openGenerate: document.getElementById('open-generate'),
  generateModal: document.getElementById('generate-modal'),
  closeGenerate: document.getElementById('close-generate'),
  generateConfig: document.getElementById('generate-config'),
  generateWorld: document.getElementById('generate-world'),
  yearSlider: document.getElementById('year-slider'),
  yearInput: document.getElementById('year-input'),
  yearValue: document.getElementById('year-value'),
  yearTitle: document.getElementById('year-title'),
  timelineHeatmap: document.getElementById('timeline-heatmap'),
  eventsGroups: document.getElementById('events-groups'),
  headlineEvents: document.getElementById('headline-events'),
  warsOverview: document.getElementById('wars-overview'),
  absorptionLedger: document.getElementById('absorption-ledger'),
  topPowers: document.getElementById('top-powers'),
  inspectorSubtitle: document.getElementById('inspector-subtitle'),
  tabButtons: document.querySelectorAll('.tab-button'),
  tabEvent: document.getElementById('tab-event'),
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

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
};

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const mapKey = (layer, year) => `${state.worldId}:${layer}:${year}`;

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
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

const colorFromId = (id, saturation = 0.55, lightness = 0.55) => {
  const hash = fnv1a(id);
  const hue = hash % 360;
  return hslToRgb(hue, saturation, lightness);
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

const parseHash = () => {
  const params = new URLSearchParams(window.location.hash.replace('#', ''));
  return {
    world: params.get('world'),
    year: params.get('year') ? Number(params.get('year')) : null,
    polity: params.get('polity'),
    war: params.get('war'),
    event: params.get('event'),
    change: params.get('change'),
    layer: params.get('layer')
  };
};

const updateHash = (mode = 'push') => {
  const params = new URLSearchParams();
  if (state.worldId) params.set('world', state.worldId);
  if (state.year !== null) params.set('year', String(state.year));
  if (state.selectedPolityId) params.set('polity', state.selectedPolityId);
  if (state.selectedWarId) params.set('war', state.selectedWarId);
  if (state.selectedEventId) params.set('event', state.selectedEventId);
  if (state.selectedChangeId) params.set('change', state.selectedChangeId);
  if (state.layer) params.set('layer', state.layer);
  const hash = `#${params.toString()}`;
  if (mode === 'replace') {
    history.replaceState(null, '', hash);
    syncFromHash();
  } else {
    window.location.hash = hash;
  }
};

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

const cellLatLon = (x, y, width, height) => {
  const lat = (y / (height - 1)) * 180 - 90;
  const lon = (x / (width - 1)) * 360 - 180;
  return { lat, lon };
};

const renderWorldMeta = () => {
  if (!state.worldMeta) return;
  const { startYear, endYear, summary } = state.worldMeta;
  const totals = summary?.totals;
  elements.worldMeta.textContent = `Years ${startYear} - ${endYear} · Wars ${totals?.wars ?? 0} · Battles ${
    totals?.battles ?? 0
  } · Annexations ${totals?.annexations ?? 0}`;
};

const renderTabs = (active) => {
  elements.tabButtons.forEach((button) => {
    const tab = button.dataset.tab;
    const isActive = tab === active;
    button.classList.toggle('active', isActive);
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.toggle('active', isActive);
  });
};

const clearSelections = () => {
  state.selectedPolityId = null;
  state.selectedWarId = null;
  state.selectedEventId = null;
  state.selectedChangeId = null;
  state.selectedChange = null;
  state.selectedEvent = null;
};

const selectPolity = (id) => {
  clearSelections();
  state.selectedPolityId = id;
  updateHash();
};

const selectWar = (id) => {
  clearSelections();
  state.selectedWarId = id;
  updateHash();
};

const selectEvent = (id) => {
  clearSelections();
  state.selectedEventId = id;
  updateHash();
};

const selectChange = (id) => {
  clearSelections();
  state.selectedChangeId = id;
  updateHash();
};

const renderHeatmap = () => {
  if (!state.worldMeta) return;
  const canvas = elements.timelineHeatmap;
  const ctxHeat = canvas.getContext('2d');
  const { startYear, endYear } = state.worldMeta;
  const totalYears = endYear - startYear + 1;
  const width = canvas.clientWidth || 280;
  canvas.width = width;
  canvas.height = canvas.height || 64;
  const height = canvas.height;
  ctxHeat.clearRect(0, 0, width, height);
  let maxCount = 1;
  const counts = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const summary = state.summaryByYear.get(year);
    const count = summary ? Object.values(summary.counts).reduce((acc, value) => acc + value, 0) : 0;
    counts.push(count);
    if (count > maxCount) maxCount = count;
  }
  const barWidth = width / totalYears;
  counts.forEach((count, index) => {
    const intensity = count / maxCount;
    ctxHeat.fillStyle = `rgba(94, 228, 199, ${0.2 + intensity * 0.8})`;
    const x = index * barWidth;
    ctxHeat.fillRect(x, height - intensity * height, Math.max(barWidth - 0.5, 1), intensity * height);
  });
};

const renderEventsInYear = (events) => {
  const groups = {
    'Wars & Battles': [],
    'Treaties / Alliances': [],
    'Annexations / Absorptions / Territorial changes': [],
    'Internal crises': [],
    'Economy / Tech milestones': [],
    'Other events': []
  };
  events.forEach((event) => {
    const type = event.type.toLowerCase();
    if (type.includes('war')) groups['Wars & Battles'].push(event);
    else if (type.includes('treaty') || type.includes('alliance')) groups['Treaties / Alliances'].push(event);
    else if (type.includes('annex') || type.includes('absorb') || type.includes('secession') || type.includes('union')) {
      groups['Annexations / Absorptions / Territorial changes'].push(event);
    } else if (type.includes('crisis') || type.includes('rebellion')) groups['Internal crises'].push(event);
    else if (type.includes('tech') || type.includes('economy')) groups['Economy / Tech milestones'].push(event);
    else groups['Other events'].push(event);
  });

  elements.eventsGroups.innerHTML = '';
  Object.entries(groups).forEach(([title, items]) => {
    if (items.length === 0) return;
    const group = document.createElement('div');
    group.className = 'event-group';
    const heading = document.createElement('h4');
    heading.textContent = title;
    group.appendChild(heading);
    items.forEach((event) => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.textContent = event.title;
      card.addEventListener('click', () => selectEvent(event.id));
      group.appendChild(card);
    });
    elements.eventsGroups.appendChild(group);
  });
};

const renderHeadlineEvents = (events) => {
  elements.headlineEvents.innerHTML = '';
  events.slice(0, 5).forEach((event) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<strong>${event.title}</strong><div class="muted">Type: ${event.type}</div>`;
    card.addEventListener('click', () => selectEvent(event.id));
    elements.headlineEvents.appendChild(card);
  });
};

const renderWarsOverview = (year) => {
  elements.warsOverview.innerHTML = '';
  const started = state.wars.filter((war) => war.startYear === year);
  const ended = state.wars.filter((war) => war.endYear === year);
  const ongoing = state.wars.filter((war) => war.startYear <= year && (!war.endYear || war.endYear > year));

  const section = (label, list) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'item';
    wrapper.innerHTML = `<strong>${label}</strong>`;
    list.slice(0, 5).forEach((war) => {
      const line = document.createElement('div');
      line.textContent = `${war.name} (${war.startYear}${war.endYear ? `-${war.endYear}` : ''})`;
      line.addEventListener('click', () => selectWar(war.id));
      wrapper.appendChild(line);
    });
    elements.warsOverview.appendChild(wrapper);
  };

  section('Started', started);
  section('Ended', ended);
  section('Ongoing', ongoing);
};

const renderAbsorptionLedger = (changes) => {
  elements.absorptionLedger.innerHTML = '';
  if (changes.length === 0) {
    elements.absorptionLedger.innerHTML = '<div class="item">No territorial changes recorded this year.</div>';
    return;
  }
  changes.forEach((change) => {
    const winner = change.winnerPolityId ? state.politiesById.get(change.winnerPolityId) ?? change.winnerPolityId : 'Unknown';
    const loser = change.loserPolityId ? state.politiesById.get(change.loserPolityId) ?? change.loserPolityId : 'Unknown';
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<strong>${winner}</strong> → ${loser}<div class="muted">${change.type}</div>`;
    item.addEventListener('click', () => selectChange(change.id));
    elements.absorptionLedger.appendChild(item);
  });
};

const renderTopPowers = (polities) => {
  elements.topPowers.innerHTML = '';
  polities.forEach((polity, index) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<strong>#${index + 1} ${polity.name}</strong> · Power ${formatNumber(polity.stats.powerScore)}`;
    item.addEventListener('click', () => selectPolity(polity.id));
    elements.topPowers.appendChild(item);
  });
};

const renderInspectorEvent = (event) => {
  if (!event) {
    elements.tabEvent.innerHTML = '<div class="item">Select an event to see details.</div>';
    return;
  }
  const actors = [...event.actors.primary, ...(event.actors.secondary ?? [])]
    .map((id) => state.politiesById.get(id) ?? id)
    .join(', ');
  const causes = event.causes.map((cause) => `${cause.key} (${cause.weight.toFixed(2)})`).join(', ');
  const effects = event.effects.join(', ');
  elements.tabEvent.innerHTML = `
    <div class="item"><strong>${event.title}</strong><div>Year ${event.year}</div></div>
    <div class="item"><strong>What happened</strong><div>${event.explanation.join(' ')}</div></div>
    <div class="item"><strong>Who</strong><div>${actors || 'Unknown'}</div></div>
    <div class="item"><strong>Why</strong><div>${causes || 'Unspecified'}</div></div>
    <div class="item"><strong>What changed</strong><div>${effects || 'No recorded effects'}</div></div>
  `;
};

const renderInspectorPolity = (polity, history) => {
  if (!polity) {
    elements.tabPolity.innerHTML = '<div class="item">Select a polity to see details.</div>';
    return;
  }
  const stats = polity.stats;
  const events = history?.events ?? [];
  const changes = history?.changes ?? [];
  elements.tabPolity.innerHTML = `
    <div class="item"><strong>${polity.name}</strong><div>${polity.type ?? 'Polity'} · Capital ${polity.capitalCityId ?? 'Unknown'}</div></div>
    <div class="item"><strong>Stats at year ${state.year}</strong>
      <div>Power ${formatNumber(stats.powerScore)} · Pop ${formatNumber(stats.population)} · GDP ${formatNumber(stats.gdp)}</div>
      <div>Tech ${formatNumber(stats.techLevel)} · Stability ${formatNumber(stats.stability)} · Military ${formatNumber(stats.military)}</div>
    </div>
    <div class="item"><strong>Key history</strong>
      ${events.slice(0, 10).map((event) => `<div>${event.year} · ${event.title}</div>`).join('') || 'No events'}
    </div>
    <div class="item"><strong>Territory changes</strong>
      ${changes
        .slice(0, 10)
        .map((change) => `<div>${change.year} · ${change.gained ? 'Gained' : 'Lost'} · ${change.otherPolityId ?? 'Unknown'}</div>`)
        .join('') || 'No changes'}
    </div>
  `;
};

const renderInspectorWar = (war) => {
  if (!war) {
    elements.tabWar.innerHTML = '<div class="item">Select a war to see details.</div>';
    return;
  }
  const sidesA = war.sides.A.map((id) => state.politiesById.get(id) ?? id).join(', ');
  const sidesB = war.sides.B.map((id) => state.politiesById.get(id) ?? id).join(', ');
  const battles = war.battles
    .map(
      (battle) =>
        `<div class="battle" data-cell="${battle.locationCellId}">${battle.year} · ${battle.type} · ${battle.result}</div>`
    )
    .join('');
  elements.tabWar.innerHTML = `
    <div class="item"><strong>${war.name}</strong><div>${war.startYear} - ${war.endYear ?? 'ongoing'} · ${war.outcome}</div></div>
    <div class="item"><strong>Sides</strong><div>A: ${sidesA}</div><div>B: ${sidesB}</div></div>
    <div class="item"><strong>Why it started</strong><div>${war.explanation.join(' ')}</div></div>
    <div class="item"><strong>Battles</strong>${battles || 'No battles recorded'}</div>
  `;
  elements.tabWar.querySelectorAll('.battle').forEach((node) => {
    node.addEventListener('click', () => {
      state.highlightCellId = Number(node.dataset.cell);
      renderMap();
    });
  });
};

const renderInspectorChange = (change) => {
  if (!change) {
    elements.tabChange.innerHTML = '<div class="item">Select a change to see details.</div>';
    return;
  }
  const winner = change.winnerPolityId ? state.politiesById.get(change.winnerPolityId) ?? change.winnerPolityId : 'Unknown';
  const loser = change.loserPolityId ? state.politiesById.get(change.loserPolityId) ?? change.loserPolityId : 'Unknown';
  elements.tabChange.innerHTML = `
    <div class="item"><strong>${change.type}</strong><div>Year ${change.year}</div></div>
    <div class="item"><strong>Who absorbed whom</strong><div>${winner} → ${loser}</div></div>
    <div class="item"><strong>Reason</strong><div>${change.reason}</div></div>
    <div class="item"><strong>Linked war/treaty</strong><div>${change.linkedWarId ?? 'None'}</div></div>
  `;
};

const renderInspector = async () => {
  if (state.selectedEventId) {
    renderTabs('event');
    renderInspectorEvent(state.selectedEvent);
    elements.inspectorSubtitle.textContent = 'Event page';
    return;
  }
  if (state.selectedPolityId) {
    renderTabs('polity');
    elements.inspectorSubtitle.textContent = 'Polity page';
    const polity = await fetchJson(`/world/${state.worldId}/polity/${state.selectedPolityId}?year=${state.year}`);
    const fromYear = Math.max(state.worldMeta.startYear, state.year - 50);
    const history = await fetchJson(
      `/world/${state.worldId}/polity/${state.selectedPolityId}/history?from=${fromYear}&to=${state.year}`
    );
    renderInspectorPolity(polity, history);
    return;
  }
  if (state.selectedWarId) {
    renderTabs('war');
    elements.inspectorSubtitle.textContent = 'War page';
    const war = await fetchJson(`/world/${state.worldId}/war/${state.selectedWarId}`);
    renderInspectorWar(war);
    return;
  }
  if (state.selectedChangeId) {
    renderTabs('change');
    elements.inspectorSubtitle.textContent = 'Change page';
    const change = state.selectedChange;
    renderInspectorChange(change);
    return;
  }
  renderTabs('event');
  renderInspectorEvent(null);
  renderInspectorPolity(null);
  renderInspectorWar(null);
  renderInspectorChange(null);
  elements.inspectorSubtitle.textContent = 'Select an item to open its page.';
};

const loadYearData = async () => {
  if (!state.worldId || state.year === null) return;
  const year = state.year;
  const [events, changes, polities, topPowers] = await Promise.all([
    fetchJson(`/world/${state.worldId}/timeline?from=${year}&to=${year}`),
    fetchJson(`/world/${state.worldId}/changes?year=${year}`),
    fetchJson(`/world/${state.worldId}/polities?year=${year}`),
    fetchJson(`/world/${state.worldId}/polities?year=${year}&sort=powerScore&limit=5`)
  ]);
  state.politiesById = new Map(polities.map((polity) => [polity.id, polity.name]));
  renderEventsInYear(events);
  renderHeadlineEvents(events);
  renderWarsOverview(year);
  renderAbsorptionLedger(changes);
  renderTopPowers(topPowers);
};

const loadSummary = async () => {
  if (!state.worldMeta || !state.worldId) return;
  const { startYear, endYear } = state.worldMeta;
  const response = await fetchJson(`/world/${state.worldId}/years/summary?from=${startYear}&to=${endYear}`);
  const years = response.years ?? response;
  state.summaryByYear = new Map(years.map((item) => [item.year, item]));
  renderHeatmap();
};

const renderMap = async () => {
  if (!state.worldId || !state.planet || state.year === null) return;
  const { mapWidth, mapHeight } = state.planet;
  elements.canvas.width = mapWidth;
  elements.canvas.height = mapHeight;
  const key = mapKey(state.layer, state.year);
  let data = state.mapCache.get(key);
  if (!data) {
    data = await fetchJson(`/world/${state.worldId}/map?layer=${state.layer}&year=${state.year}`);
    state.mapCache.set(key, data);
  }
  const image = ctx.createImageData(mapWidth, mapHeight);
  if (state.layer === 'political') {
    const owners = decodePoliticalOwners(data, mapWidth * mapHeight);
    state.ownerCache.set(state.year, owners);
    owners.forEach((owner, idx) => {
      const [r, g, b] = owner ? colorFromId(owner) : [30, 30, 30];
      const offset = idx * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    });
  } else if (state.layer === 'elevation') {
    const values = data;
    const min = Math.min(...values);
    const max = Math.max(...values);
    values.forEach((value, idx) => {
      const normalized = (value - min) / (max - min || 1);
      const shade = Math.floor(30 + normalized * 225);
      const offset = idx * 4;
      image.data[offset] = shade;
      image.data[offset + 1] = shade;
      image.data[offset + 2] = shade;
      image.data[offset + 3] = 255;
    });
  } else if (state.layer === 'resources') {
    data.forEach((tags, idx) => {
      const tag = tags && tags.length ? tags[0] : 'none';
      const [r, g, b] = colorFromId(tag, 0.45, 0.5);
      const offset = idx * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    });
  } else {
    data.forEach((biome, idx) => {
      const [r, g, b] = colorFromId(String(biome), 0.45, 0.5);
      const offset = idx * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    });
  }

  if (state.selectedChange?.regionsTransferredCompressed) {
    for (const range of state.selectedChange.regionsTransferredCompressed) {
      for (let idx = range.start; idx <= range.end; idx += 1) {
        const offset = idx * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 120;
        image.data[offset + 2] = 120;
        image.data[offset + 3] = 255;
      }
    }
  }

  if (state.highlightCellId !== null) {
    const offset = state.highlightCellId * 4;
    image.data[offset] = 255;
    image.data[offset + 1] = 255;
    image.data[offset + 2] = 255;
    image.data[offset + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  elements.mapNotes.textContent = `Layer ${state.layer} · Year ${state.year}`;
};

const updateTooltip = (event) => {
  if (!state.planet || !state.worldId || !state.cells) return;
  const rect = elements.canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * state.planet.mapWidth);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * state.planet.mapHeight);
  if (x < 0 || y < 0 || x >= state.planet.mapWidth || y >= state.planet.mapHeight) {
    elements.tooltip.hidden = true;
    return;
  }
  const idx = y * state.planet.mapWidth + x;
  const cell = state.cells[idx];
  if (!cell) return;
  const owner = state.ownerCache.get(state.year)?.[idx];
  const { lat, lon } = cellLatLon(x, y, state.planet.mapWidth, state.planet.mapHeight);
  elements.tooltip.innerHTML = `
    <div><strong>Cell ${x}, ${y}</strong></div>
    <div>Lat ${lat.toFixed(2)} · Lon ${lon.toFixed(2)}</div>
    <div>Biome ${cell.biomeId} · Elev ${cell.elevation.toFixed(2)}</div>
    <div>Ocean ${cell.isOcean ? 'Yes' : 'No'}</div>
    <div>Owner ${owner ? state.politiesById.get(owner) ?? owner : 'None'}</div>
  `;
  elements.tooltip.style.left = `${event.clientX - rect.left + 12}px`;
  elements.tooltip.style.top = `${event.clientY - rect.top + 12}px`;
  elements.tooltip.hidden = false;
};

const handleMapClick = (event) => {
  if (!state.planet) return;
  const rect = elements.canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * state.planet.mapWidth);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * state.planet.mapHeight);
  const idx = y * state.planet.mapWidth + x;
  const owner = state.ownerCache.get(state.year)?.[idx];
  if (owner) {
    selectPolity(owner);
  }
};

const setYear = (year) => {
  if (!state.worldMeta) return;
  const clamped = Math.min(state.worldMeta.endYear, Math.max(state.worldMeta.startYear, year));
  state.year = clamped;
  elements.yearInput.value = clamped;
  elements.yearSlider.value = clamped;
  elements.yearValue.textContent = clamped;
  elements.yearTitle.textContent = `Year ${clamped}`;
  updateHash('replace');
};

const syncFromHash = async () => {
  const hash = parseHash();
  if (hash.layer) state.layer = hash.layer;
  if (hash.world && hash.world !== state.worldId) {
    state.worldId = hash.world;
    await loadWorld();
  }
  if (!state.worldId) return;
  if (hash.year !== null && hash.year !== state.year) {
    setYear(hash.year);
  }
  state.selectedPolityId = hash.polity;
  state.selectedWarId = hash.war;
  state.selectedEventId = hash.event;
  state.selectedChangeId = hash.change;
  await refreshSelections();
};

const refreshSelections = async () => {
  if (!state.worldId || state.year === null) return;
  state.selectedEvent = null;
  state.selectedChange = null;
  if (state.selectedEventId) {
    const events = await fetchJson(`/world/${state.worldId}/timeline?from=${state.year}&to=${state.year}`);
    state.selectedEvent = events.find((event) => event.id === state.selectedEventId) ?? null;
    if (!state.selectedEvent) {
      const summary = state.summaryByYear.get(state.year);
      if (summary?.headlines?.some((item) => item.id === state.selectedEventId)) {
        state.selectedEvent = events[0] ?? null;
      }
    }
  }
  if (state.selectedChangeId) {
    const changes = await fetchJson(`/world/${state.worldId}/changes?year=${state.year}`);
    state.selectedChange = changes.find((change) => change.id === state.selectedChangeId) ?? null;
  }
  if (state.selectedEvent?.refs?.changeId) {
    const change = await fetchJson(`/world/${state.worldId}/changes?year=${state.selectedEvent.year}`);
    state.selectedChange = change.find((item) => item.id === state.selectedEvent.refs.changeId) ?? null;
  }
  await renderInspector();
  await renderMap();
};

const loadWorld = async () => {
  if (!state.worldId) return;
  const [meta, planet, wars, cells] = await Promise.all([
    fetchJson(`/world/${state.worldId}/meta`),
    fetchJson(`/world/${state.worldId}/planet`),
    fetchJson(`/world/${state.worldId}/wars`),
    fetchJson(`/world/${state.worldId}/cells`)
  ]);
  state.worldMeta = meta;
  state.planet = planet;
  state.wars = wars;
  state.cells = cells;
  renderWorldMeta();
  if (state.year === null) {
    state.year = state.worldMeta.startYear;
  }
  elements.yearSlider.min = state.worldMeta.startYear;
  elements.yearSlider.max = state.worldMeta.endYear;
  setYear(state.year);
  elements.layerSelect.value = state.layer;
  await loadSummary();
  await loadYearData();
  await renderMap();
};

const loadWorlds = async () => {
  const worlds = await fetchJson('/worlds');
  state.worlds = worlds;
  elements.worldSelect.innerHTML = '';
  worlds.forEach((world) => {
    const option = document.createElement('option');
    option.value = world.worldId;
    option.textContent = `World ${world.worldId.slice(0, 8)}`;
    elements.worldSelect.appendChild(option);
  });
  if (!state.worldId && worlds.length > 0) {
    state.worldId = worlds[0].worldId;
    updateHash('replace');
  }
  elements.emptyWorld.hidden = worlds.length > 0;
};

const runSearch = async (query) => {
  if (!state.worldId || !query) {
    elements.searchResults.hidden = true;
    return;
  }
  const response = await fetchJson(`/world/${state.worldId}/search?q=${encodeURIComponent(query)}&limit=20`);
  const results = response.results ?? response;
  elements.searchResults.innerHTML = '';
  results.forEach((result, index) => {
    const button = document.createElement('button');
    button.textContent = `${result.title} (${result.kind}${result.year !== null && result.year !== undefined ? ` · ${result.year}` : ''})`;
    if (result.snippet) {
      const snippet = document.createElement('div');
      snippet.style.fontSize = '0.8rem';
      snippet.style.color = 'rgba(255,255,255,0.6)';
      snippet.textContent = result.snippet;
      button.appendChild(snippet);
    }
    button.addEventListener('click', () => {
      if (result.year !== null && result.year !== undefined) {
        setYear(result.year);
      }
      if (result.kind === 'polity') selectPolity(result.id);
      if (result.kind === 'war') selectWar(result.id);
      if (result.kind === 'event') selectEvent(result.id);
      if (result.kind === 'change') selectChange(result.id);
      elements.searchResults.hidden = true;
    });
    if (index === state.searchActiveIndex) {
      button.classList.add('active');
    }
    elements.searchResults.appendChild(button);
  });
  elements.searchResults.hidden = results.length === 0;
};

const handleGenerate = async () => {
  const configText = elements.generateConfig.value || defaultConfig;
  const response = await fetchJson('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: configText
  });
  state.worldId = response.worldId;
  elements.generateModal.close();
  await loadWorlds();
  updateHash();
};

elements.generateConfig.value = defaultConfig;
elements.refreshWorlds.addEventListener('click', loadWorlds);
elements.worldSelect.addEventListener('change', (event) => {
  state.worldId = event.target.value;
  updateHash();
});
elements.openGenerate.addEventListener('click', () => elements.generateModal.showModal());
elements.closeGenerate.addEventListener('click', () => elements.generateModal.close());
elements.generateWorld.addEventListener('click', handleGenerate);

elements.yearInput.addEventListener(
  'input',
  debounce((event) => {
    setYear(Number(event.target.value));
    loadYearData().then(renderMap);
  }, 120)
);
elements.yearSlider.addEventListener(
  'input',
  debounce((event) => {
    setYear(Number(event.target.value));
    loadYearData().then(renderMap);
  }, 60)
);
document.querySelectorAll('.timeline-buttons button').forEach((button) => {
  button.addEventListener('click', () => {
    const step = Number(button.dataset.step);
    setYear(state.year + step);
    loadYearData().then(renderMap);
  });
});

elements.timelineHeatmap.addEventListener('click', (event) => {
  if (!state.worldMeta) return;
  const rect = elements.timelineHeatmap.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  const year = Math.round(state.worldMeta.startYear + ratio * (state.worldMeta.endYear - state.worldMeta.startYear));
  setYear(year);
  loadYearData().then(renderMap);
});

elements.timelineHeatmap.addEventListener('mousemove', (event) => {
  if (!state.worldMeta) return;
  const rect = elements.timelineHeatmap.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  const year = Math.round(state.worldMeta.startYear + ratio * (state.worldMeta.endYear - state.worldMeta.startYear));
  elements.timelineHeatmap.title = `Jump to year ${year}`;
});

elements.timelineHeatmap.addEventListener('mouseleave', () => {
  elements.timelineHeatmap.title = '';
});

elements.layerSelect.addEventListener('change', (event) => {
  state.layer = event.target.value;
  updateHash();
  renderMap();
});

elements.focusPolity.addEventListener('click', () => {
  if (!state.selectedPolityId) return;
  state.layer = 'political';
  elements.layerSelect.value = 'political';
  updateHash();
  renderMap();
});

elements.showChange.addEventListener('click', () => {
  if (!state.selectedChange) return;
  renderMap();
});

elements.searchInput.addEventListener(
  'input',
  debounce((event) => {
    state.searchActiveIndex = 0;
    runSearch(event.target.value.trim());
  }, 150)
);

elements.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const items = Array.from(elements.searchResults.querySelectorAll('button'));
    if (items.length === 0) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    state.searchActiveIndex = (state.searchActiveIndex + delta + items.length) % items.length;
    items.forEach((item, index) => item.classList.toggle('active', index === state.searchActiveIndex));
  }
  if (event.key === 'Enter') {
    const items = Array.from(elements.searchResults.querySelectorAll('button'));
    const active = items[state.searchActiveIndex];
    if (active) {
      active.click();
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === '/') {
    event.preventDefault();
    elements.searchInput.focus();
    elements.searchInput.select();
  }
  if (event.key === 'Escape') {
    elements.searchInput.blur();
    elements.searchResults.hidden = true;
  }
  if (event.key === 'ArrowLeft') {
    setYear(state.year - 1);
    loadYearData().then(renderMap);
  }
  if (event.key === 'ArrowRight') {
    setYear(state.year + 1);
    loadYearData().then(renderMap);
  }
});

elements.tabButtons.forEach((button) => {
  button.addEventListener('click', () => renderTabs(button.dataset.tab));
});

elements.canvas.addEventListener('mousemove', updateTooltip);
elements.canvas.addEventListener('mouseleave', () => (elements.tooltip.hidden = true));
elements.canvas.addEventListener('click', handleMapClick);

window.addEventListener('hashchange', syncFromHash);

loadWorlds().then(syncFromHash);
