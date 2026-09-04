import fs from 'node:fs';
import path from 'node:path';

const stylePath = path.join(import.meta.dirname, '../assets/goway-map-style.json');
const style = JSON.parse(fs.readFileSync(stylePath, 'utf8'));

const POI_YELLOW = '#FACC15';
const POI_YELLOW_STROKE = '#FDE68A';
const TRANSIT_CYAN = '#38BDF8';
const TRANSIT_CYAN_DARK = '#0EA5E9';
const TRANSIT_CYAN_GLOW = 'rgba(56, 189, 248, 0.35)';

const setLayout = (id, layout) => {
  const layer = style.layers.find((l) => l.id === id);
  if (layer) layer.layout = { ...layer.layout, ...layout };
};

const setPaint = (id, paint) => {
  const layer = style.layers.find((l) => l.id === id);
  if (layer) layer.paint = { ...layer.paint, ...paint };
};

const insertBefore = (targetId, layer) => {
  const idx = style.layers.findIndex((l) => l.id === targetId);
  if (idx >= 0) style.layers.splice(idx, 0, layer);
};

// Supprimer les flèches de sens unique
for (const id of ['road_oneway', 'road_oneway_opposite']) {
  setLayout(id, { visibility: 'none' });
}

// Voies de transport en bleu cyan
for (const id of ['railway_transit', 'railway_minor', 'railway']) {
  setPaint(id, { 'line-color': TRANSIT_CYAN, 'line-opacity': 0.95 });
}
for (const id of ['railway_transit_dashline', 'railway_minor_dashline', 'railway_dashline']) {
  setPaint(id, { 'line-color': TRANSIT_CYAN_DARK, 'line-opacity': 0.85 });
}

// POI OpenStreetMap — points jaunes
const poiCircleBase = {
  type: 'circle',
  source: 'openmaptiles',
  'source-layer': 'poi',
  minzoom: 13,
  filter: ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
  paint: {
    'circle-color': POI_YELLOW,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 5, 18, 6],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': POI_YELLOW_STROKE,
    'circle-opacity': 0.95,
  },
};

insertBefore('highway_name_other', {
  ...poiCircleBase,
  id: 'poi_points_yellow',
  filter: [
    'all',
    ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
    ['!', ['match', ['get', 'class'], ['bus', 'rail', 'tram', 'airport'], true, false]],
  ],
});

insertBefore('highway_name_other', {
  ...poiCircleBase,
  id: 'poi_transit_cyan',
  filter: [
    'all',
    ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
    ['match', ['get', 'class'], ['bus', 'rail', 'tram', 'airport'], true, false],
  ],
  paint: {
    'circle-color': TRANSIT_CYAN,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6, 18, 7],
    'circle-stroke-width': 2,
    'circle-stroke-color': TRANSIT_CYAN_DARK,
    'circle-opacity': 0.95,
    'circle-blur': 0.15,
  },
});

// Labels POI harmonisés
for (const id of ['place_other', 'place_suburb', 'place_village', 'place_town', 'place_city', 'place_city_large']) {
  setPaint(id, {
    'text-color': POI_YELLOW,
    'text-halo-color': 'rgba(13, 17, 23, 0.9)',
  });
}

fs.writeFileSync(stylePath, JSON.stringify(style));
console.log('Patched', stylePath);
