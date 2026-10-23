/**
 * Deterministic game rules for Frame Snake.
 * The engine intentionally has no browser dependencies so a run can be
 * replayed, tested, or moved to another TV surface without changing rules.
 */

export const BOARD_WIDTH = 28;
export const BOARD_HEIGHT = 16;

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

export const DIFFICULTIES = Object.freeze({
  mellow: Object.freeze({ label: 'Mellow', tick: 190 }),
  steady: Object.freeze({ label: 'Steady', tick: 140 }),
  frantic: Object.freeze({ label: 'Frantic', tick: 98 }),
});

const POWER_TYPES = ['shield', 'slow', 'bonus'];
const MODE_NAMES = new Set(['classic', 'expedition', 'daily']);
const DIFFICULTY_NAMES = new Set(Object.keys(DIFFICULTIES));

export function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

export function sameCell(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

export function isOpposite(a, b) {
  return Boolean(a && b && a.x + b.x === 0 && a.y + b.y === 0);
}

export function dailySeed(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return hashSeed(
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
  );
}

export function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function randomUnit(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

function randomInt(state, max) {
  return Math.floor(randomUnit(state) * max);
}

function inBounds(cell, state) {
  return (
    cell.x >= 0 && cell.x < state.width && cell.y >= 0 && cell.y < state.height
  );
}

function blocked(cell, state, includeFood = true) {
  if (state.snake.some((part) => sameCell(part, cell))) return true;
  if (state.obstacles.some((obstacle) => sameCell(obstacle, cell))) return true;
  if (includeFood && sameCell(state.food, cell)) return true;
  if (state.powerUp && sameCell(state.powerUp.pos, cell)) return true;
  return false;
}

export function spawnFood(state) {
  const free = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = { x, y };
      if (!blocked(cell, state, true)) free.push(cell);
    }
  }
  state.food = free.length ? free[randomInt(state, free.length)] : null;
  return state.food;
}

export function spawnPowerUp(state, forceType) {
  const free = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = { x, y };
      // A power-up must never hide the food. The old false flag allowed two
      // targets to occupy one pixel, which made a pickup depend on draw order.
      if (!blocked(cell, state, true)) free.push(cell);
    }
  }
  if (!free.length) {
    state.powerUp = null;
    return null;
  }
  const type =
    forceType && POWER_TYPES.includes(forceType)
      ? forceType
      : POWER_TYPES[randomInt(state, POWER_TYPES.length)];
  state.powerUp = { type, pos: free[randomInt(state, free.length)], ttl: 80 };
  return state.powerUp;
}

function makeExpeditionObstacles(state) {
  const candidates = [];
  for (let y = 2; y < state.height - 2; y += 1) {
    for (let x = 2; x < state.width - 2; x += 1) {
      if ((x + y * 3) % 7 === 0) candidates.push({ x, y });
    }
  }
  const count = Math.min(
    10,
    Math.max(4, Math.floor((state.level - 1) * 2) + 4),
  );
  while (state.obstacles.length < count && candidates.length) {
    const index = randomInt(state, candidates.length);
    const obstacle = candidates.splice(index, 1)[0];
    if (!blocked(obstacle, state, true)) state.obstacles.push(obstacle);
  }
}

export function createGame(options = {}) {
  const mode = MODE_NAMES.has(options.mode) ? options.mode : 'classic';
  const difficulty = DIFFICULTY_NAMES.has(options.difficulty)
    ? options.difficulty
    : 'steady';
  const seed =
    options.seed === undefined
      ? mode === 'daily'
        ? dailySeed()
        : Date.now()
      : hashSeed(options.seed);
  const cx = Math.floor(BOARD_WIDTH / 2);
  const cy = Math.floor(BOARD_HEIGHT / 2);
  const state = {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    mode,
    difficulty,
    rng: seed,
    seed,
    snake: [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ],
    direction: { ...DIRECTIONS.right },
    nextDirection: { ...DIRECTIONS.right },
    food: null,
    powerUp: null,
    obstacles: [],
    score: 0,
    combo: 0,
    bestCombo: 0,
    level: 1,
    foods: 0,
    tick: 0,
    comboTicks: 0,
    shield: 0,
    slowTicks: 0,
    status: 'ready',
    reason: '',
  };
  if (mode === 'expedition' || mode === 'daily') makeExpeditionObstacles(state);
  spawnFood(state);
  return state;
}

export function setDirection(state, direction) {
  const requested =
    typeof direction === 'string' ? DIRECTIONS[direction] : direction;
  if (!requested || isOpposite(requested, state.direction)) return state;
  state.nextDirection = { x: requested.x, y: requested.y };
  return state;
}

export function speedFor(state) {
  const base = DIFFICULTIES[state.difficulty]?.tick || DIFFICULTIES.steady.tick;
  const levelBonus =
    state.mode === 'classic'
      ? Math.min(45, (state.level - 1) * 5)
      : Math.min(65, (state.level - 1) * 7);
  const slow = state.slowTicks > 0 ? 1.42 : 1;
  return Math.max(54, Math.round((base - levelBonus) * slow));
}

export function beginGame(state) {
  if (state.status === 'ready' || state.status === 'paused')
    state.status = 'running';
  return state;
}

export function pauseGame(state) {
  if (state.status === 'running') state.status = 'paused';
  return state;
}

export function stepGame(state) {
  if (state.status !== 'running' || !state.snake.length) return state;
  state.tick += 1;
  state.direction = { ...state.nextDirection };
  const head = state.snake[0];
  const next = { x: head.x + state.direction.x, y: head.y + state.direction.y };
  const ateFood = sameCell(next, state.food);
  const hitsBody = state.snake.some(
    (part, index) =>
      (ateFood || index !== state.snake.length - 1) && sameCell(part, next),
  );
  const hitsObstacle = state.obstacles.some((obstacle) =>
    sameCell(obstacle, next),
  );
  const hitsWall = !inBounds(next, state);
  const protectedCollision =
    (hitsWall || hitsBody || hitsObstacle) && state.shield > 0;
  if (hitsWall || hitsBody || hitsObstacle) {
    if (protectedCollision) {
      state.shield = 0;
      state.score = Math.max(0, state.score - 3);
      // A shield absorbs the impact without putting the head outside the
      // board (or inside an obstacle). The player gets one clean tick to turn.
      return state;
    } else {
      state.status = 'over';
      state.reason = hitsWall ? 'wall' : hitsObstacle ? 'obstacle' : 'tail';
      return state;
    }
  }

  state.snake.unshift(next);
  if (!ateFood) state.snake.pop();
  if (state.powerUp) {
    state.powerUp.ttl -= 1;
    if (sameCell(next, state.powerUp.pos)) {
      if (state.powerUp.type === 'shield') state.shield = 1;
      if (state.powerUp.type === 'slow') state.slowTicks = 72;
      if (state.powerUp.type === 'bonus')
        state.score += 30 * Math.max(1, state.level);
      state.powerUp = null;
    } else if (state.powerUp.ttl <= 0) state.powerUp = null;
  }
  if (state.comboTicks > 0) state.comboTicks -= 1;
  if (state.comboTicks === 0) state.combo = 0;
  if (state.slowTicks > 0) state.slowTicks -= 1;
  if (ateFood) {
    state.foods += 1;
    state.combo = state.comboTicks > 0 ? state.combo + 1 : 1;
    state.comboTicks = 18;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.level = 1 + Math.floor(state.foods / 5);
    const multiplier = Math.max(1, state.combo);
    state.score += 10 * state.level * multiplier;
    if (state.foods % 4 === 0 && !state.powerUp) spawnPowerUp(state);
    if (state.mode === 'expedition' || state.mode === 'daily')
      makeExpeditionObstacles(state);
    spawnFood(state);
    if (!state.food) {
      state.status = 'won';
      state.reason = 'board';
    }
  }
  return state;
}

export function resetGame(state, options = {}) {
  return createGame({
    mode: options.mode || state.mode,
    difficulty: options.difficulty || state.difficulty,
    seed: options.seed === undefined ? state.seed : options.seed,
  });
}
