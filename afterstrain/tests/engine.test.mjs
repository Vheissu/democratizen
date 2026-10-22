import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createGame, tick, evolve, devolve, totals, serialize, restore, canEvolve, stats } from '../src/engine.mjs';
import { TRAITS, SCENARIOS } from '../src/catalog.mjs';
const world = JSON.parse(readFileSync(new URL('../src/data/world.json', import.meta.url)));

test('same seed and decisions reproduce a complete run', () => {
  const first = createGame(world, { seed: 'repro' });
  const second = createGame(world, { seed: 'repro' });
  for (let day = 0; day < 400; day++) {
    if (day % 10 === 0) for (const state of [first, second]) evolve(state, 'reach-0');
    tick(first); tick(second);
  }
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.countries, createGame(world, { seed: 'different' }).countries);
});
test('save round trip preserves subsequent random events and simulation', () => {
  const original = createGame(world, { seed: 'resume', chaos: 2, archetype: 'prism' });
  for (let day = 0; day < 120; day++) tick(original);
  const resumed = restore(serialize(original), world);
  assert.ok(resumed);
  for (let day = 0; day < 150; day++) { tick(original); tick(resumed); }
  assert.deepEqual(resumed, original);
});
test('trait prerequisites, spending, ranks, and suppression are enforced', () => {
  const state = createGame(world);
  assert.equal(evolve(state, 'reach-2'), false);
  assert.equal(evolve(state, 'invented'), false);
  assert.equal(evolve(state, 'reach-0'), true);
  assert.equal(state.points, 13);
  assert.equal(evolve(state, 'reach-1'), true);
  assert.equal(devolve(state, 'reach-0'), false);
  assert.equal(devolve(state, 'reach-1'), true);
  assert.equal(devolve(state, 'reach-0'), true);
  state.scenario = 'sandbox';
  for (let rank = 0; rank < 3; rank++) assert.equal(evolve(state, 'reach-0'), true);
  assert.equal(evolve(state, 'reach-0'), false);
});
test('synergies activate only when all required traits exist', () => {
  const state = createGame(world, { scenario: 'sandbox' });
  const initial = stats(state).spread;
  for (const id of ['reach-0', 'reach-1', 'veil-0', 'veil-1']) evolve(state, id);
  assert.ok(Math.abs(stats(state).spread - initial - 0.32 - 0.35) < 1e-8);
});
test('corrupt and untrusted saves are rejected', () => {
  assert.equal(restore('{bad', world), null);
  const valid = createGame(world);
  for (const mutate of [state => { state.countries[0].influence = 2; }, state => { state.rng = 0; }, state => { state.traits['bad-id'] = 2; }, state => { state.countries.pop(); }, state => { state.events = [{ id: 'invented' }]; }, state => { state.research = null; }]) {
    const state = structuredClone(valid); mutate(state); assert.equal(restore(serialize(state), world), null);
  }
});
test('population, influence and bounds hold across scenarios and seeds', () => {
  for (const scenario of SCENARIOS) for (let seed = 0; seed < 6; seed++) {
    const state = createGame(world, { seed: String(seed), scenario: scenario.id, chaos: 2 });
    for (let day = 0; day < 800; day++) {
      if (day % 10 === 0) { const next = TRAITS.find(trait => canEvolve(state, trait)); if (next) evolve(state, next.id); }
      tick(state);
    }
    const total = totals(state);
    assert.ok(total.influenced <= total.population);
    assert.ok(state.countries.every(country => Number.isFinite(country.influence) && country.influence >= 0 && country.influence <= 1));
    assert.ok(state.countries.every(country => country.dead >= 0 && country.recovered >= 0 && country.dead + country.recovered <= country.influence + 1e-10));
    assert.ok(state.events.length <= 10 && state.news.length <= 60 && state.history.length <= 100);
    assert.ok(state.points >= 0 && state.research <= 100 && state.awareness <= 100);
    if (scenario.id === 'sandbox') assert.equal(state.status, 'playing');
    else assert.notEqual(state.status, 'playing');
  }
});
test('victory, research defeat, awareness defeat and deadline are terminal', () => {
  for (const scenario of ['frontier', 'silent', 'race']) {
    const state = createGame(world, { scenario });
    if (scenario === 'frontier') state.research = 100;
    if (scenario === 'silent') state.awareness = 65;
    if (scenario === 'race') state.day = 239;
    tick(state); assert.equal(state.status, 'lost');
    const snapshot = serialize(state); tick(state); assert.equal(serialize(state), snapshot);
  }
  const state = createGame(world);
  state.countries.forEach(country => { country.influence = 0.9; });
  tick(state); assert.equal(state.status, 'won');
});
test('a focused evolution strategy can win an open frontier run', () => {
  const state = createGame(world, { seed: 'first-light', difficulty: 0.6 });
  const order = ['reach-0', 'travel-0', 'reach-1', 'veil-0', 'resist-0', 'travel-1', 'cold-0', 'warm-0', 'veil-1', 'reach-2', 'resist-1'];
  for (let day = 0; day < 1000 && state.status === 'playing'; day++) {
    const id = order.find(id => !state.traits[id] && canEvolve(state, TRAITS.find(trait => trait.id === id)));
    if (id) evolve(state, id);
    tick(state);
  }
  assert.equal(state.status, 'won', `Ended day ${state.day}, influence ${totals(state).fraction}, research ${state.research}`);
});
test('simulation benchmark reports per-day cost', () => {
  const state = createGame(world, { scenario: 'sandbox' });
  const start = performance.now();
  for (let day = 0; day < 1000; day++) tick(state);
  const elapsed = performance.now() - start;
  console.log(`176 regions: ${(elapsed / 1000).toFixed(3)} ms per simulated day`);
  assert.ok(elapsed < 10000);
});
test('custom worlds and genome choices affect simulation and survive saves', () => {
  const baseline = createGame(world, { seed: 'custom' });
  const custom = createGame(world, { seed: 'custom', genome: 'nomad', climate: 20, mobility: 2, capacity: 0.5, density: 2 });
  assert.ok(custom.countries[0].temperature > baseline.countries[0].temperature);
  assert.ok(custom.countries[0].connections > baseline.countries[0].connections);
  assert.ok(custom.countries[0].health < baseline.countries[0].health);
  assert.ok(stats(custom).travel > stats(baseline).travel);
  for (let day = 0; day < 100; day++) tick(custom);
  assert.deepEqual(restore(serialize(custom), world), custom);
});
test('disruptive traits cause deaths and reduce the active spreading population', () => {
  const state = createGame(world, { scenario: 'sandbox', seed: 'mortality' });
  state.countries.forEach(country => { country.influence = 0.5; });
  for (const id of ['impact-0', 'impact-1', 'impact-2']) evolve(state, id);
  state.research = 50;
  for (let day = 0; day < 20; day++) tick(state);
  const total = totals(state);
  assert.ok(total.dead > 0 && total.recovered > 0);
  assert.ok(total.active < total.influenced);
  assert.deepEqual(restore(serialize(state), world), state);
});
