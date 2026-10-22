import { ARCHETYPES, TRAITS, EVENTS, SCENARIOS, SYNERGIES, GENOMES } from './catalog.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function hash(seed) {
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0 || 1;
}
export function random(state) {
  let value = state.rng;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng / 4294967296;
}
export function createGame(world, options = {}) {
  const seed = String(options.seed || 'afterstrain').slice(0, 80);
  const state = {
    version: 1, seed, rng: hash(seed), name: String(options.name || 'Unnamed strain').slice(0, 40),
    archetype: ARCHETYPES.some(item => item.id === options.archetype) ? options.archetype : 'echo',
    scenario: SCENARIOS.some(item => item.id === options.scenario) ? options.scenario : 'frontier',
    difficulty: clamp(Number(options.difficulty) || 1, 0.6, 1.6),
    chaos: clamp(Number(options.chaos) || 1, 0.5, 2),
    genome: GENOMES.some(item => item.id === options.genome) ? options.genome : 'balanced',
    climate: clamp(Number(options.climate) || 0, -20, 20),
    mobility: clamp(Number(options.mobility) || 1, 0.5, 2),
    capacity: clamp(Number(options.capacity) || 1, 0.5, 1.5),
    density: clamp(Number(options.density) || 1, 0.5, 2),
    day: 0, points: 18, awareness: 0, research: 0, traits: {}, events: [], news: [],
    history: [], status: 'playing', reached: 1, milestones: 0, countries: [],
  };
  state.countries = world.map(country => ({
    id: country.id, name: country.name, center: country.center,
    population: Math.round((0.5e6 + random(state) ** 2 * 120e6) * state.density),
    health: clamp((0.3 + random(state) * 0.7) * state.capacity, 0.1, 1), connections: (0.4 + random(state) * 0.6) * state.mobility,
    temperature: 32 - Math.abs(country.center[1]) * 0.7 + random(state) * 12 + state.climate,
    influence: 0, disruption: 0, closed: false, routes: [],
  }));
  for (const country of state.countries) {
    const nearest = state.countries.filter(other => other.id !== country.id).sort((left, right) => distance(country, left) - distance(country, right)).slice(0, 4);
    const distant = state.countries[Math.floor(random(state) * state.countries.length)];
    country.routes = [...new Set([...nearest.map(other => other.id), ...(distant.id !== country.id ? [distant.id] : [])])];
  }
  const origin = state.countries.find(country => country.id === options.origin) || state.countries[Math.floor(random(state) * state.countries.length)];
  origin.influence = 0.002;
  state.origin = origin.id;
  report(state, `First signal detected in ${origin.name}. The world is still quiet.`, 'origin');
  return state;
}
function distance(left, right) {
  const longitude = Math.abs(left.center[0] - right.center[0]);
  return Math.min(longitude, 360 - longitude) ** 2 + (left.center[1] - right.center[1]) ** 2;
}
export function report(state, title, kind = 'event') {
  state.news.unshift({ day: state.day, title, kind });
  state.news.length = Math.min(state.news.length, 60);
}
export function stats(state) {
  const archetype = ARCHETYPES.find(item => item.id === state.archetype);
  const result = { spread: archetype.spread, stealth: archetype.stealth, drift: archetype.drift, travel: 1, resist: 0, cold: archetype.cold || 0, warm: archetype.warm || 0, impact: 0 };
  for (const [key, value] of Object.entries(GENOMES.find(item => item.id === state.genome).modifiers)) result[key] += value;
  for (const trait of TRAITS) result[trait.stat] += (state.traits[trait.id] || 0) * trait.value;
  for (const synergy of SYNERGIES) if (synergy.needs.every(id => state.traits[id])) result[synergy.stat] += synergy.value;
  return result;
}
export function totals(state) {
  const population = state.countries.reduce((total, country) => total + country.population, 0);
  const influenced = state.countries.reduce((total, country) => total + country.population * country.influence, 0);
  return { population, influenced, fraction: influenced / population, reached: state.countries.filter(country => country.influence > 0).length };
}
export function cost(state, trait) { return Math.ceil(trait.cost * (1 + (state.traits[trait.id] || 0) * 0.65)); }
export function canEvolve(state, trait) {
  return state.status === 'playing' && (state.traits[trait.id] || 0) < trait.max && (!trait.requires || state.traits[trait.requires]) && (state.scenario === 'sandbox' || state.points >= cost(state, trait));
}
export function evolve(state, id) {
  const trait = TRAITS.find(item => item.id === id);
  if (!trait || !canEvolve(state, trait)) return false;
  if (state.scenario !== 'sandbox') state.points -= cost(state, trait);
  state.traits[id] = (state.traits[id] || 0) + 1;
  report(state, `${trait.name} evolved to rank ${state.traits[id]}.`, 'evolution');
  return true;
}
export function devolve(state, id) {
  const trait = TRAITS.find(item => item.id === id);
  if (state.status !== 'playing' || !trait || !state.traits[id]) return false;
  if (state.traits[id] === 1 && TRAITS.some(item => item.requires === id && state.traits[item.id])) return false;
  state.traits[id] -= 1;
  report(state, `${trait.name} suppressed. No points refunded.`, 'evolution');
  return true;
}
export function tick(state) {
  if (state.status !== 'playing') return state;
  state.day += 1;
  const attributes = stats(state);
  const scenario = SCENARIOS.find(item => item.id === state.scenario);
  state.events = state.events.filter(event => event.until > state.day);
  if (random(state) < 0.09 * state.chaos && state.events.length < 10) {
    const template = EVENTS[Math.floor(random(state) * EVENTS.length)];
    const country = state.countries[Math.floor(random(state) * state.countries.length)];
    state.events.push({ ...template, country: country.id, until: state.day + template.duration });
    report(state, `${country.name}: ${template.title}.`);
  }
  if (random(state) < 0.012 * state.chaos * attributes.drift) {
    const choices = TRAITS.filter(trait => (state.traits[trait.id] || 0) < trait.max && (!trait.requires || state.traits[trait.requires]));
    if (choices.length) {
      const trait = choices[Math.floor(random(state) * choices.length)];
      state.traits[trait.id] = (state.traits[trait.id] || 0) + 1;
      report(state, `Spontaneous mutation: ${trait.name}. Suppress it in the lab if it changes your plans.`, 'mutation');
    }
  }
  const lookup = new Map(state.countries.map(country => [country.id, country]));
  const incoming = new Set();
  for (const country of state.countries) {
    const effects = { travel: 1, warm: 0, cold: 0 };
    for (const event of state.events.filter(event => event.country === country.id)) {
      if (event.stat === 'travel') effects.travel *= event.value;
      if (event.stat === 'warm' || event.stat === 'cold') effects[event.stat] += event.value;
    }
    country.closed = state.awareness > 45 + country.health * 30;
    if (country.influence <= 0) continue;
    const temperature = country.temperature + (scenario.temperature || 0);
    const adaptation = temperature < 10 ? attributes.cold + effects.cold : temperature > 25 ? attributes.warm + effects.warm : 0.3;
    const climate = clamp(0.65 + adaptation * 0.4, 0.3, 2.5);
    const defence = 1 - country.health * 0.25 * state.difficulty - state.research / 350;
    const growth = 0.075 * attributes.spread * climate * defence * Math.sqrt(state.density);
    country.influence = clamp(country.influence + Math.max(0.00004, country.influence * (1 - country.influence) * growth), 0, 1);
    country.disruption = clamp(country.influence * (0.08 + attributes.impact * 0.15), 0, 1);
    for (const destination of country.routes) {
      const target = lookup.get(destination);
      if (target.influence > 0) continue;
      const restriction = country.closed || target.closed ? 0.12 : 1;
      const chance = Math.min(0.4, country.influence * 0.1 * attributes.travel * country.connections * effects.travel * restriction);
      if (random(state) < chance) incoming.add(destination);
    }
  }
  for (const id of incoming) {
    const country = lookup.get(id);
    country.influence = 0.001;
    state.points += 2;
    if (incoming.size < 5) report(state, `New signal in ${country.name}.`, 'spread');
  }
  const total = totals(state);
  state.reached = total.reached;
  if (state.day % 5 === 0) state.points += 2;
  const milestone = Math.floor(total.fraction * 20);
  if (milestone > state.milestones) { state.points += (milestone - state.milestones) * 5; state.milestones = milestone; }
  let researchEffect = 1;
  let awarenessEffect = 1;
  for (const event of state.events) {
    if (event.stat === 'research') researchEffect *= event.value;
    if (event.stat === 'awareness') awarenessEffect *= event.value;
  }
  state.awareness = clamp(state.awareness + (total.fraction * 0.7 + attributes.impact * total.fraction * 0.8) / attributes.stealth * awarenessEffect, 0, 100);
  if (state.awareness > 8) state.research = clamp(state.research + (0.06 + state.awareness * 0.006) * state.difficulty * scenario.research * researchEffect / (1 + attributes.resist), 0, 100);
  if (state.day % 5 === 0) { state.history.push({ day: state.day, influence: total.fraction, research: state.research }); if (state.history.length > 100) state.history.shift(); }
  if (state.scenario !== 'sandbox') {
    if (state.research >= 100 || (scenario.awarenessLimit && state.awareness >= scenario.awarenessLimit) || (scenario.deadline && state.day >= scenario.deadline && total.fraction < scenario.target)) state.status = 'lost';
    else if (total.fraction >= scenario.target) state.status = 'won';
    if (state.status !== 'playing') report(state, state.status === 'won' ? 'Your strain has reached its objective.' : 'The world has contained your strain.', 'result');
  }
  return state;
}
export function serialize(state) { return JSON.stringify(state); }
export function restore(raw, world) {
  try {
    if (typeof raw !== 'string' || raw.length > 2e6) return null;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !['playing', 'won', 'lost'].includes(saved.status) || !ARCHETYPES.some(item => item.id === saved.archetype) || !SCENARIOS.some(item => item.id === saved.scenario)) return null;
    if (!Array.isArray(saved.countries) || saved.countries.length !== world.length || !saved.traits || typeof saved.traits !== 'object') return null;
    const validNumber = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
    for (const [key, low, high] of [['day', 0, 1e8], ['rng', 1, 4294967295], ['points', 0, 1e9], ['research', 0, 100], ['awareness', 0, 100], ['difficulty', 0.6, 1.6], ['chaos', 0.5, 2], ['milestones', 0, 20]]) if (!validNumber(saved[key], low, high)) return null;
    if (typeof saved.name !== 'string' || saved.name.length > 40 || typeof saved.seed !== 'string' || saved.seed.length > 80) return null;
    if (!world.some(country => country.id === saved.origin)) return null;
    if (saved.genome !== undefined && !GENOMES.some(item => item.id === saved.genome)) return null;
    for (const [key, low, high] of [['climate', -20, 20], ['mobility', 0.5, 2], ['capacity', 0.5, 1.5], ['density', 0.5, 2]]) if (saved[key] !== undefined && !validNumber(saved[key], low, high)) return null;
    const rebuilt = createGame(world, saved);
    for (let index = 0; index < world.length; index++) {
      const country = saved.countries[index];
      if (country.id !== world[index].id || !validNumber(country.influence, 0, 1) || !validNumber(country.disruption, 0, 1)) return null;
      rebuilt.countries[index].influence = country.influence;
      rebuilt.countries[index].disruption = country.disruption;
      rebuilt.countries[index].closed = Boolean(country.closed);
    }
    for (const [id, rank] of Object.entries(saved.traits)) if (!TRAITS.some(trait => trait.id === id) || !Number.isInteger(rank) || rank < 0 || rank > 3) return null;
    if (TRAITS.some(trait => saved.traits[trait.id] > 0 && trait.requires && !saved.traits[trait.requires])) return null;
    if (!Array.isArray(saved.events) || saved.events.length > 10 || saved.events.some(event => !EVENTS.some(template => template.id === event.id) || !world.some(country => country.id === event.country) || !validNumber(event.until, saved.day, saved.day + 30))) return null;
    const events = saved.events.map(event => ({ ...EVENTS.find(template => template.id === event.id), country: event.country, until: event.until }));
    const news = Array.isArray(saved.news) ? saved.news.slice(0, 60).filter(item => typeof item.title === 'string' && item.title.length < 300 && validNumber(item.day, 0, saved.day)).map(item => ({ title: item.title, day: item.day, kind: String(item.kind).slice(0, 20) })) : [];
    const history = Array.isArray(saved.history) ? saved.history.slice(-100).filter(item => validNumber(item.day, 0, saved.day) && validNumber(item.influence, 0, 1) && validNumber(item.research, 0, 100)) : [];
    for (const key of ['day', 'rng', 'points', 'research', 'awareness', 'traits', 'status', 'milestones']) rebuilt[key] = saved[key];
    Object.assign(rebuilt, { events, news, history, reached: totals(rebuilt).reached });
    return rebuilt;
  } catch { return null; }
}
