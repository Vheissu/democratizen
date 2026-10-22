import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { feature } from 'topojson-client';
const atlas = JSON.parse(await readFile(new URL('../node_modules/world-atlas/countries-110m.json', import.meta.url)));
const countries = feature(atlas, atlas.objects.countries).features.filter(country => country.id !== '010').map(country => {
  const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
  const rings = polygons.map(polygon => polygon[0].map(([longitude, latitude]) => [Math.round(longitude * 100) / 100, Math.round(latitude * 100) / 100]));
  const largest = [...rings].sort((left, right) => right.length - left.length)[0];
  const center = largest.reduce((sum, point) => [sum[0] + point[0] / largest.length, sum[1] + point[1] / largest.length], [0, 0]);
  return { id: country.id, name: country.properties.name, center, rings };
});
await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/data/world.json', import.meta.url), JSON.stringify(countries));
console.log(`Prepared ${countries.length} country outlines from Natural Earth / world-atlas.`);
