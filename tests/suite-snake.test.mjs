import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS,
  createGame,
  dailySeed,
  isOpposite,
  setDirection,
  spawnFood,
  spawnPowerUp,
  stepGame,
} from '../suite/engines/snake.mjs';

function running(options = {}) {
  const state = createGame({ seed: 42, ...options });
  state.status = 'running';
  return state;
}

test('direction changes reject an immediate reversal', () => {
  const state = running();
  setDirection(state, DIRECTIONS.left);
  assert.deepEqual(state.nextDirection, DIRECTIONS.right);
  setDirection(state, DIRECTIONS.down);
  assert.deepEqual(state.nextDirection, DIRECTIONS.down);
  assert.equal(isOpposite(DIRECTIONS.up, DIRECTIONS.down), true);
});

test('a normal step advances the head and removes the tail', () => {
  const state = running();
  const before = state.snake.map((part) => ({ ...part }));
  stepGame(state);
  assert.deepEqual(state.snake.slice(1), before.slice(0, -1));
  assert.deepEqual(state.snake[0], { x: before[0].x + 1, y: before[0].y });
  assert.equal(state.score, 0);
});

test('food grows the snake, increments level and awards a combo score', () => {
  const state = running();
  state.food = { x: state.snake[0].x + 1, y: state.snake[0].y };
  const length = state.snake.length;
  stepGame(state);
  assert.equal(state.snake.length, length + 1);
  assert.equal(state.foods, 1);
  assert.equal(state.combo, 1);
  assert.equal(state.score, 10);
});

test('wall collision ends a run', () => {
  const state = running();
  state.snake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  state.direction = { ...DIRECTIONS.left };
  state.nextDirection = { ...DIRECTIONS.left };
  stepGame(state);
  assert.equal(state.status, 'over');
  assert.equal(state.reason, 'wall');
});

test('shield absorbs one collision and is consumed', () => {
  const state = running();
  state.shield = 1;
  state.snake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  state.direction = { ...DIRECTIONS.left };
  state.nextDirection = { ...DIRECTIONS.left };
  stepGame(state);
  assert.equal(state.status, 'running');
  assert.equal(state.shield, 0);
  assert.equal(state.snake[0].x, 0);
  assert.equal(
    state.snake.every((part) => part.x >= 0 && part.x < state.width),
    true,
  );
});

test('food placement is deterministic for a fixed seed and avoids the snake', () => {
  const one = createGame({ seed: 'same-board' });
  const two = createGame({ seed: 'same-board' });
  assert.deepEqual(one.food, two.food);
  assert.equal(
    one.snake.some((part) => part.x === one.food.x && part.y === one.food.y),
    false,
  );
  one.food = null;
  two.food = null;
  assert.deepEqual(spawnFood(one), spawnFood(two));
});

test('expedition obstacles are deterministic and daily seeds are date-stable', () => {
  const one = createGame({ mode: 'expedition', seed: 'route-a' });
  const two = createGame({ mode: 'expedition', seed: 'route-a' });
  assert.deepEqual(one.obstacles, two.obstacles);
  assert.equal(dailySeed('2026-10-22'), dailySeed('2026-10-22'));
  assert.notEqual(dailySeed('2026-10-22'), dailySeed('2026-10-23'));
});

test('power-ups use a supported type and an open cell', () => {
  const state = running({ mode: 'expedition' });
  state.food = { x: 0, y: 0 };
  const power = spawnPowerUp(state, 'bonus');
  assert.equal(power.type, 'bonus');
  assert.equal(
    state.snake.some(
      (part) => part.x === power.pos.x && part.y === power.pos.y,
    ),
    false,
  );
  assert.notDeepEqual(power.pos, state.food);
});

test('a shield absorbs an obstacle impact without moving into the obstacle', () => {
  const state = running({ mode: 'expedition' });
  state.snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
  ];
  state.direction = { ...DIRECTIONS.right };
  state.nextDirection = { ...DIRECTIONS.right };
  state.obstacles = [{ x: 6, y: 5 }];
  state.shield = 1;
  stepGame(state);
  assert.equal(state.status, 'running');
  assert.deepEqual(state.snake[0], { x: 5, y: 5 });
  assert.equal(
    state.obstacles.some(
      (obstacle) =>
        obstacle.x === state.snake[0].x && obstacle.y === state.snake[0].y,
    ),
    false,
  );
});
