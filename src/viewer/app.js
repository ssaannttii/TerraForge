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
  comparePolityId: null,
  mapIndexByCoord: null,
  lastRenderKey: null,
  highlightCellId: null
};

const elements = {
  refreshWorlds: document.getElementById('refresh-worlds'),
  worldSelect: document.getElementById('world-select'),
  worldMeta: document.getElementById('world-meta'),
  generateConfig: document.getElementById('generate-config'),
  generateWorld: document.getElementById('generate-world'),
  yearSlider: document.getElementById('year-slider'),
  yearValue: document.getElementById('year-value'),
  layerSelect: document.getElementById('layer-select'),
  canvas: document.getElementById('map-canvas'),
  tooltip: document.getElementById('map-tooltip'),
  mapNotes: document.getElementById('map-notes'),
  compareToggle: document.getElementById('compare-toggle'),
  compareSelect: document.getElementById('compare-select'),
  polityPrimary: document.getElementById('polity-primary'),
  politySecondary: document.getElementById('polity-secondary'),
  eventType: document.getElementById('event-type'),
  eventPolity: document.getElementById('event-polity'),
  eventSearch: document.getElementById('event-search'),
  eventsList: document.getElementById('events-list'),
  warsList: document.getElementById('wars-list'),
  warDetail: document.getElementById('war-detail')
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

const loadWorlds = async () => {
  const data = await fetchJson('/worlds');
  state.worlds = data;
  elements.worldSelect.innerHTML = '';
  if (data.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No worlds loaded';
    option.value = '';
    elements.worldSelect.appendChild(option);
    elements.worldMeta.textContent = 'Generate a world to begin.';
    return;
  }
  data.forEach((world) => {
    const option = document.createElement('option');
    option.value = world.worldId;
    option.textContent = `${world.worldId.slice(0, 8)} · ${world.meta.startYear} → ${world.meta.endYear} · ${world.meta.configHash.slice(0, 8)}`;
    elements.worldSelect.appendChild(option);
  });
  if (!state.worldId || !data.find((w) => w.worldId === state.worldId)) {
    state.worldId = data[0].worldId;
    elements.worldSelect.value = state.worldId;
  }
};

const buildCoordIndex = (world) => {
  const index = new Array(world.planet.mapWidth * world.planet.mapHeight).fill(-1);
  world.cells.forEach((cell, idx) => {
    const pos = cell.y * world.planet.mapWidth + cell.x;
    index[pos] = idx;
  });
  return index;
};

const renderWorldMeta = (worldId) => {
  const entry = state.worlds.find((w) => w.worldId === worldId);
  if (!entry) return;
  elements.worldMeta.textContent = `Seed ${entry.meta.seed} · Years ${entry.meta.startYear}-${entry.meta.endYear} · Hash ${entry.meta.configHash}`;
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
  elements.yearSlider.min = String(world.meta.startYear);
  elements.yearSlider.max = String(world.meta.endYear);
  elements.yearSlider.value = String(state.year);
  elements.yearValue.textContent = String(state.year);
  elements.canvas.width = world.planet.mapWidth;
  elements.canvas.height = world.planet.mapHeight;
  elements.mapNotes.textContent = `Map: ${world.planet.mapWidth} × ${world.planet.mapHeight} cells.`;
  renderWorldMeta(worldId);
  populateWars();
  await refreshYear();
};

const loadPolities = async () => {
  const polities = await fetchJson(`/world/${state.worldId}/polities?year=${state.year}`);
  state.polityById = new Map(polities.map((p) => [p.id, p]));
  elements.compareSelect.innerHTML = '<option value="">None</option>';
  elements.eventPolity.innerHTML = '<option value="">All</option>';
  polities.forEach((polity) => {
    const option = document.createElement('option');
    option.value = polity.id;
    option.textContent = polity.name;
    elements.compareSelect.appendChild(option);
    const eventOption = option.cloneNode(true);
    elements.eventPolity.appendChild(eventOption);
  });
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
  const renderKey = `${state.worldId}:${state.layer}:${state.year}`;
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
    state.world.cells.forEach((cell, idx) => {
      const tags = cell.resourceTags;
      if (tags && tags.length > 0) {
        ctx.fillRect(cell.x, cell.y, 1, 1);
      }
    });
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

const updatePolityPanel = (polity, targetEl) => {
  if (!polity) {
    targetEl.innerHTML = '<p class="hint">Select a polity on the map.</p>';
    return;
  }
  targetEl.innerHTML = `
    <div><strong>${polity.name}</strong> (${polity.type})</div>
    <div>Capital: ${polity.capitalCityId}</div>
    <div>Culture(s): ${polity.cultureGroupIds.join(', ')}</div>
    <div>Power: ${formatNumber(polity.stats.powerScore)}</div>
    <div>Population: ${formatNumber(polity.stats.population)}</div>
    <div>GDP: ${formatNumber(polity.stats.gdp)}</div>
    <div>Tech: ${formatNumber(polity.stats.techLevel)}</div>
    <div>Stability: ${formatNumber(polity.stats.stability)}</div>
    <div>Military: ${formatNumber(polity.stats.military)}</div>
    <div>Naval: ${formatNumber(polity.stats.navalProjection)}</div>
    <div>Logistics: ${formatNumber(polity.stats.logistics)}</div>
  `;
};

const refreshPolityInspector = async () => {
  if (!state.selectedPolityId) {
    updatePolityPanel(null, elements.polityPrimary);
  } else {
    const polity = await fetchJson(`/world/${state.worldId}/polity/${state.selectedPolityId}?year=${state.year}`);
    updatePolityPanel(polity, elements.polityPrimary);
  }
  if (elements.compareToggle.checked && state.comparePolityId) {
    const polity = await fetchJson(`/world/${state.worldId}/polity/${state.comparePolityId}?year=${state.year}`);
    updatePolityPanel(polity, elements.politySecondary);
  } else {
    updatePolityPanel(null, elements.politySecondary);
  }
};

const refreshEvents = async () => {
  if (!state.world) return;
  const from = Math.max(state.world.meta.startYear, state.year - 20);
  const to = state.year;
  const events = await fetchJson(`/world/${state.worldId}/timeline?from=${from}&to=${to}`);
  const types = Array.from(new Set(events.map((event) => event.type))).sort();
  elements.eventType.innerHTML = '<option value="">All</option>';
  types.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    elements.eventType.appendChild(option);
  });

  const render = () => {
    const typeFilter = elements.eventType.value;
    const polityFilter = elements.eventPolity.value;
    const search = elements.eventSearch.value.toLowerCase();
    const filtered = events.filter((event) => {
      if (typeFilter && event.type !== typeFilter) return false;
      if (polityFilter) {
        const actors = [...event.actors.primary, ...(event.actors.secondary ?? [])];
        if (!actors.includes(polityFilter)) return false;
      }
      if (search) {
        const haystack = `${event.title} ${event.explanation.join(' ')}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    elements.eventsList.innerHTML = '';
    filtered.forEach((event) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `<strong>${event.year}</strong> · ${event.title}`;
      item.addEventListener('click', () => {
        if (event.refs?.warId) {
          showWar(event.refs.warId);
        } else if (event.refs?.treatyId) {
          const treaty = state.world.treaties.find((t) => t.id === event.refs.treatyId);
          if (treaty) {
            elements.warDetail.innerHTML = `<strong>Treaty:</strong> ${treaty.name} (${treaty.year})<br/>Terms: ${treaty.terms.join('; ')}`;
          }
        }
      });
      elements.eventsList.appendChild(item);
    });
  };

  elements.eventType.onchange = render;
  elements.eventPolity.onchange = render;
  elements.eventSearch.oninput = render;
  render();
};

const populateWars = () => {
  if (!state.world) return;
  elements.warsList.innerHTML = '';
  state.world.wars.forEach((war) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.textContent = `${war.name} (${war.startYear}-${war.endYear ?? 'ongoing'})`;
    item.addEventListener('click', () => showWar(war.id));
    elements.warsList.appendChild(item);
  });
};

const showWar = async (warId) => {
  if (!warId) return;
  const war = await fetchJson(`/world/${state.worldId}/war/${warId}`);
  const getName = (id) => state.polityById.get(id)?.name ?? id;
  const battleItems = war.battles
    .map((battle) => {
      return `<div class="list-item" data-cell="${battle.locationCellId}">
        <strong>${battle.year}</strong> · ${battle.type} · ${battle.result}
        <div>Cell ${battle.locationCellId} · Casualties A ${battle.casualtiesEstimate.A} / B ${battle.casualtiesEstimate.B}</div>
      </div>`;
    })
    .join('');
  elements.warDetail.innerHTML = `
    <div><strong>${war.name}</strong> (${war.startYear}-${war.endYear ?? 'ongoing'})</div>
    <div>Sides: A [${war.sides.A.map(getName).join(', ')}] vs B [${war.sides.B.map(getName).join(', ')}]</div>
    <div>Outcome: ${war.outcome}</div>
    <div>${war.treatyId ? `Treaty: ${war.treatyId}` : ''}</div>
    <div class="list">${battleItems || '<div class="list-item">No battles recorded.</div>'}</div>
  `;
  elements.warDetail.querySelectorAll('[data-cell]').forEach((node) => {
    node.addEventListener('click', () => {
      const cellId = Number(node.getAttribute('data-cell'));
      if (Number.isFinite(cellId)) {
        state.highlightCellId = cellId;
        renderMap();
      }
    });
  });
};

const refreshYear = async () => {
  elements.yearValue.textContent = String(state.year);
  await loadPolities();
  await refreshEvents();
  await renderMap();
  await refreshPolityInspector();
};

let sliderTimeout = null;

const setYear = (year) => {
  if (!state.world) return;
  const clamped = Math.min(state.world.meta.endYear, Math.max(state.world.meta.startYear, year));
  state.year = clamped;
  elements.yearSlider.value = String(clamped);
  if (sliderTimeout) clearTimeout(sliderTimeout);
  sliderTimeout = setTimeout(() => {
    refreshYear();
  }, 80);
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
  if (elements.compareToggle.checked) {
    state.comparePolityId = ownerId;
    elements.compareSelect.value = ownerId;
  } else {
    state.selectedPolityId = ownerId;
  }
  refreshPolityInspector();
};

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
  elements.compareToggle.addEventListener('change', () => {
    elements.compareSelect.disabled = !elements.compareToggle.checked;
    refreshPolityInspector();
  });
  elements.compareSelect.addEventListener('change', (event) => {
    state.comparePolityId = event.target.value || null;
    refreshPolityInspector();
  });

  elements.canvas.addEventListener('mousemove', handleCanvasMove);
  elements.canvas.addEventListener('mouseleave', handleCanvasLeave);
  elements.canvas.addEventListener('click', handleCanvasClick);

  await loadWorlds();
  if (state.worldId) await loadWorld(state.worldId);
};

init().catch((error) => {
  console.error(error);
});
