import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimer,
  tickTimer,
  resetTimer,
  timerText,
  lifeStep,
  pixelHistory,
  formatZone,
} from '../suite/engines/studio.mjs';

test('focus timer counts down only while running and rolls a session', () => {
  const t = createTimer(3);
  tickTimer(t, 1);
  assert.equal(t.remaining, 3);
  t.running = true;
  tickTimer(t, 2);
  assert.equal(t.remaining, 1);
  tickTimer(t, 1);
  assert.equal(t.remaining, 0);
  assert.equal(t.running, false);
  assert.equal(t.sessions, 1);
  assert.equal(timerText(65), '01:05');
  resetTimer(t, 10);
  assert.equal(t.remaining, 10);
  assert.equal(t.running, false);
});

test('life step applies birth, survival, and death', () => {
  const g = new Uint8Array(25);
  g[1 * 5 + 1] = 1;
  g[1 * 5 + 2] = 1;
  g[1 * 5 + 3] = 1;
  const next = lifeStep(g, 5, 5);
  assert.equal(next[0 * 5 + 2], 1);
  assert.equal(next[1 * 5 + 2], 1);
  assert.equal(next[2 * 5 + 2], 1);
  assert.equal(next[1 * 5 + 1], 0);
});

test('pixel history undo and redo preserve snapshots', () => {
  const h = pixelHistory();
  const a = [0, 0],
    b = [1, 0],
    c = [1, 1];
  h.push(a);
  h.push(b);
  assert.deepEqual(h.undo(c), b);
  assert.deepEqual(h.redo(a), c);
  h.clear();
  assert.equal(h.depth, 0);
});

test('world clock formatting returns a readable time', () => {
  const value = formatZone(new Date('2025-01-01T00:00:00Z'), 'UTC', true);
  assert.match(value, /00:00:00|12:00:00/);
});

test('deadline timer catches delayed frames, excludes a pause and restarts after completion', async () => {
  const { startTimer, pauseTimer, updateTimer } = await import(
    '../suite/engines/studio.mjs'
  );
  const t = createTimer(10);
  startTimer(t, 1000);
  updateTimer(t, 6500);
  assert.equal(t.remaining, 5);
  pauseTimer(t, 7000);
  assert.equal(t.remaining, 4);
  updateTimer(t, 100000);
  assert.equal(t.remaining, 4);
  startTimer(t, 200000);
  updateTimer(t, 205000);
  assert.equal(t.remaining, 0);
  assert.equal(t.sessions, 1);
  updateTimer(t, 210000);
  assert.equal(t.sessions, 1);
  startTimer(t, 220000);
  assert.equal(t.remaining, 10);
});
test('even breathing skips both zero-length holds and follows the full inhale and exhale', async () => {
  const { breathPhase } = await import('../suite/engines/studio.mjs');
  assert.equal(breathPhase(4.9, 'even').phase, 0);
  assert.equal(breathPhase(5, 'even').phase, 2);
  assert.equal(breathPhase(10, 'even').phase, 0);
  assert.equal(breathPhase(10, 'even').rounds, 1);
  assert.equal(breathPhase(4, 'box').phase, 1);
});
test('pixel undo memory is bounded without changing stored snapshots', () => {
  const h = pixelHistory();
  for (let i = 0; i < 150; i++) h.push([i]);
  assert.equal(h.depth, 100);
  assert.deepEqual(h.undo([150]), [149]);
});
