/* Browser-independent rules for the five arcade and puzzle apps. */
export const clone = (value) => JSON.parse(JSON.stringify(value));
export function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
export function rotateMatrix(matrix) {
  return Array.from({ length: matrix[0]?.length || 0 }, (_, x) =>
    Array.from(
      { length: matrix.length },
      (_, y) => matrix[matrix.length - 1 - y][x],
    ),
  );
}
export const BLOCK_SHAPES = [
  [[1, 1, 1, 1]],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
];
export function createBlocksEngine({
  width = 10,
  height = 20,
  random = Math.random,
} = {}) {
  const state = {
    width,
    height,
    board: [],
    active: null,
    next: null,
    score: 0,
    lines: 0,
    level: 1,
    over: false,
  };
  let bag = [];
  function pick() {
    if (!bag.length) {
      bag = BLOCK_SHAPES.map((_, index) => index);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    const index = bag.pop();
    return { shape: clone(BLOCK_SHAPES[index]), color: index + 1 };
  }
  function collides(
    piece = state.active,
    x = piece?.x,
    y = piece?.y,
    shape = piece?.shape,
  ) {
    return (
      !shape ||
      shape.some((row, dy) =>
        row.some(
          (cell, dx) =>
            cell &&
            (x + dx < 0 ||
              x + dx >= width ||
              y + dy >= height ||
              (y + dy >= 0 && state.board[y + dy][x + dx])),
        ),
      )
    );
  }
  function spawn() {
    const piece = state.next || pick();
    state.next = pick();
    state.active = {
      shape: clone(piece.shape),
      color: piece.color,
      x: Math.floor((width - piece.shape[0].length) / 2),
      y: 0,
    };
    if (collides()) state.over = true;
    return state.active;
  }
  function reset() {
    bag = [];
    state.board = Array.from({ length: height }, () => Array(width).fill(0));
    Object.assign(state, {
      score: 0,
      lines: 0,
      level: 1,
      over: false,
      next: null,
    });
    spawn();
    return state;
  }
  function move(dx) {
    if (state.over || collides()) return false;
    if (collides(state.active, state.active.x + dx, state.active.y))
      return false;
    state.active.x += dx;
    return true;
  }
  function rotate() {
    if (state.over) return false;
    const next = rotateMatrix(state.active.shape);
    for (const offset of [0, -1, 1, -2, 2])
      if (
        !collides(state.active, state.active.x + offset, state.active.y, next)
      ) {
        state.active.shape = next;
        state.active.x += offset;
        return true;
      }
    return false;
  }
  function clearLines() {
    const kept = state.board.filter((row) => row.some((cell) => !cell)),
      count = height - kept.length;
    state.board = Array.from({ length: count }, () =>
      Array(width).fill(0),
    ).concat(kept);
    return count;
  }
  function lock() {
    if (state.over) return 0;
    const p = state.active;
    if (p.shape.some((row, dy) => row.some((cell) => cell && p.y + dy < 0))) {
      state.over = true;
      return 0;
    }
    p.shape.forEach((row, dy) =>
      row.forEach((cell, dx) => {
        if (cell) state.board[p.y + dy][p.x + dx] = p.color;
      }),
    );
    const count = clearLines();
    state.score += ([0, 100, 300, 500, 800][count] || 0) * state.level;
    state.lines += count;
    state.level = Math.floor(state.lines / 10) + 1;
    spawn();
    return count;
  }
  function drop() {
    if (state.over) return false;
    if (collides(state.active, state.active.x, state.active.y + 1)) {
      lock();
      return false;
    }
    state.active.y++;
    return true;
  }
  function hardDrop() {
    if (state.over) return state.score;
    let distance = 0;
    while (!collides(state.active, state.active.x, state.active.y + 1)) {
      state.active.y++;
      distance++;
    }
    state.score += distance * 2;
    lock();
    return state.score;
  }
  reset();
  return {
    state,
    reset,
    collides,
    move,
    rotate,
    clearLines,
    spawn,
    lock,
    drop,
    hardDrop,
  };
}

export function createPaddleEngine({ width = 100, height = 60 } = {}) {
  const state = {
    width,
    height,
    paddle: { x: width / 2, w: 16 },
    ball: null,
    bricks: [],
    score: 0,
    lives: 3,
    level: 1,
    over: false,
    won: false,
    waiting: true,
  };
  function makeBricks() {
    state.bricks = [];
    const rows = Math.min(5 + state.level, 9);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < 10; x++)
        state.bricks.push({
          x: 8 + x * 8.4,
          y: 7 + y * 3.6,
          w: 7.2,
          h: 2.6,
          hit: false,
          value: rows - y,
        });
  }
  function resetBall() {
    const speed = 0.5 + state.level * 0.08;
    state.ball = {
      x: state.paddle.x,
      y: height - 6,
      vx: speed * 0.55,
      vy: -speed,
      r: 0.9,
    };
    state.waiting = true;
  }
  function reset() {
    Object.assign(state, {
      score: 0,
      lives: 3,
      level: 1,
      over: false,
      won: false,
    });
    state.paddle.x = width / 2;
    makeBricks();
    resetBall();
    return state;
  }
  function move(dx) {
    state.paddle.x = Math.max(
      state.paddle.w / 2,
      Math.min(width - state.paddle.w / 2, state.paddle.x + dx),
    );
    if (state.waiting) state.ball.x = state.paddle.x;
  }
  function serve() {
    if (!state.over && !state.won) state.waiting = false;
  }
  function tick() {
    if (state.over || state.won || state.waiting) return;
    const b = state.ball,
      previous = { x: b.x, y: b.y };
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < b.r || b.x > width - b.r) {
      b.vx *= -1;
      b.x = Math.max(b.r, Math.min(width - b.r, b.x));
    }
    if (b.y < b.r) {
      b.vy = Math.abs(b.vy);
      b.y = b.r;
    }
    if (
      b.vy > 0 &&
      previous.y + b.r <= height - 4 &&
      b.y + b.r >= height - 4 &&
      Math.abs(b.x - state.paddle.x) <= state.paddle.w / 2 + b.r
    ) {
      const speed = Math.hypot(b.vx, b.vy),
        ratio = Math.max(
          -0.9,
          Math.min(0.9, (b.x - state.paddle.x) / (state.paddle.w / 2)),
        );
      b.vx = speed * ratio;
      b.vy = -Math.sqrt(speed * speed - b.vx * b.vx);
      b.y = height - 4 - b.r;
    }
    for (const brick of state.bricks)
      if (
        !brick.hit &&
        b.x + b.r > brick.x &&
        b.x - b.r < brick.x + brick.w &&
        b.y + b.r > brick.y &&
        b.y - b.r < brick.y + brick.h
      ) {
        brick.hit = true;
        state.score += brick.value * 10;
        if (
          previous.x + b.r <= brick.x ||
          previous.x - b.r >= brick.x + brick.w
        )
          b.vx *= -1;
        else b.vy *= -1;
        break;
      }
    if (b.y > height + 2) {
      state.lives--;
      if (!state.lives) state.over = true;
      else resetBall();
    }
    if (state.bricks.every((brick) => brick.hit)) {
      state.level++;
      if (state.level > 4) state.won = true;
      else {
        makeBricks();
        resetBall();
      }
    }
  }
  reset();
  return { state, reset, move, tick, serve, makeBricks };
}

export function slideBoard(board, direction) {
  const n = board.length;
  if (!['left', 'right', 'up', 'down'].includes(direction))
    return { board: clone(board), gained: 0 };
  const result = Array.from({ length: n }, () => Array(n).fill(0));
  let gained = 0;
  const at = (i, j) =>
    direction === 'left'
      ? [i, j]
      : direction === 'right'
        ? [i, n - 1 - j]
        : direction === 'up'
          ? [j, i]
          : [n - 1 - j, i];
  for (let i = 0; i < n; i++) {
    const values = Array.from({ length: n }, (_, j) => {
        const [y, x] = at(i, j);
        return board[y][x];
      }).filter(Boolean),
      line = [];
    for (let j = 0; j < values.length; j++) {
      if (values[j] === values[j + 1]) {
        const value = values[j] * 2;
        line.push(value);
        gained += value;
        j++;
      } else line.push(values[j]);
    }
    while (line.length < n) line.push(0);
    line.forEach((value, j) => {
      const [y, x] = at(i, j);
      result[y][x] = value;
    });
  }
  return { board: result, gained };
}
export const mergeBoard = (board, direction) =>
  slideBoard(board, direction).board;
export function validMergeSave(value, size = 4) {
  return (
    !!value &&
    Number.isSafeInteger(value.score) &&
    value.score >= 0 &&
    Array.isArray(value.board) &&
    value.board.length === size &&
    value.board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every(
          (v) =>
            v === 0 ||
            (Number.isSafeInteger(v) && v >= 2 && Math.log2(v) % 1 === 0),
        ),
    )
  );
}
export function createMergeEngine({
  size = 4,
  random = Math.random,
  initial = true,
} = {}) {
  const state = {
    board: [],
    score: 0,
    best: 0,
    over: false,
    won: false,
    history: [],
  };
  const empty = () =>
    state.board
      .flatMap((row, y) => row.map((value, x) => (value ? null : { x, y })))
      .filter(Boolean);
  function add() {
    const places = empty();
    if (!places.length) return false;
    const p = places[Math.floor(random() * places.length)];
    state.board[p.y][p.x] = random() < 0.9 ? 2 : 4;
    return true;
  }
  function canMove() {
    return (
      empty().length > 0 ||
      ['left', 'right', 'up', 'down'].some(
        (dir) =>
          JSON.stringify(mergeBoard(state.board, dir)) !==
          JSON.stringify(state.board),
      )
    );
  }
  function reset() {
    Object.assign(state, {
      board: Array.from({ length: size }, () => Array(size).fill(0)),
      score: 0,
      over: false,
      won: false,
      history: [],
    });
    if (initial) {
      add();
      add();
    }
    return state;
  }
  function move(dir) {
    if (state.over) return false;
    const next = slideBoard(state.board, dir);
    if (JSON.stringify(next.board) === JSON.stringify(state.board))
      return false;
    state.history.push({ board: clone(state.board), score: state.score });
    if (state.history.length > 50) state.history.shift();
    state.board = next.board;
    state.score += next.gained;
    state.best = Math.max(state.best, state.score);
    add();
    state.won = state.board.some((row) => row.some((v) => v >= 2048));
    state.over = !canMove();
    return true;
  }
  function undo() {
    const saved = state.history.pop();
    if (!saved) return false;
    state.board = saved.board;
    state.score = saved.score;
    state.over = !canMove();
    state.won = state.board.some((row) => row.some((v) => v >= 2048));
    return true;
  }
  function restore(saved) {
    if (!validMergeSave(saved, size)) return false;
    state.board = clone(saved.board);
    state.score = saved.score;
    state.best = Math.max(state.best, state.score);
    state.over = !canMove();
    state.won = state.board.some((row) => row.some((v) => v >= 2048));
    state.history = [];
    return true;
  }
  reset();
  return { state, reset, add, canMove, move, undo, restore };
}

export function createMinesEngine({
  width = 10,
  height = 8,
  mines = 12,
  random = Math.random,
} = {}) {
  const state = {
    width,
    height,
    mines,
    cells: [],
    first: true,
    over: false,
    won: false,
    flags: 0,
    revealed: 0,
  };
  const valid = (x, y) =>
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height;
  function neighbours(x, y) {
    const result = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx || dy) && valid(x + dx, y + dy))
          result.push({ x: x + dx, y: y + dy });
    return result;
  }
  function reset() {
    Object.assign(state, {
      cells: Array.from({ length: width * height }, (_, i) => ({
        x: i % width,
        y: Math.floor(i / width),
        mine: false,
        revealed: false,
        flag: false,
        count: 0,
      })),
      first: true,
      over: false,
      won: false,
      flags: 0,
      revealed: 0,
    });
    return state;
  }
  function build(safe) {
    const forbidden = new Set([
        `${safe.x},${safe.y}`,
        ...neighbours(safe.x, safe.y).map((p) => `${p.x},${p.y}`),
      ]),
      pool = state.cells.filter((c) => !forbidden.has(`${c.x},${c.y}`));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    state.mines = Math.min(mines, pool.length);
    pool.slice(0, state.mines).forEach((c) => {
      c.mine = true;
    });
    state.cells.forEach((c) => {
      c.count = neighbours(c.x, c.y).filter(
        (p) => state.cells[p.y * width + p.x].mine,
      ).length;
    });
    state.first = false;
  }
  function reveal(x, y) {
    if (!valid(x, y) || state.over || state.won) return false;
    const cell = state.cells[y * width + x];
    if (cell.flag || cell.revealed) return false;
    if (state.first) build({ x, y });
    if (cell.mine) {
      cell.revealed = true;
      state.over = true;
      state.cells.forEach((c) => {
        if (c.mine) c.revealed = true;
      });
      return true;
    }
    const queue = [cell],
      seen = new Set();
    while (queue.length) {
      const c = queue.pop(),
        key = c.y * width + c.x;
      if (seen.has(key) || c.revealed || c.flag) continue;
      seen.add(key);
      c.revealed = true;
      state.revealed++;
      if (!c.count)
        neighbours(c.x, c.y).forEach((p) => {
          const n = state.cells[p.y * width + p.x];
          if (!n.mine && !n.flag && !n.revealed) queue.push(n);
        });
    }
    state.won = state.revealed === width * height - state.mines;
    return true;
  }
  function toggleFlag(x, y) {
    if (!valid(x, y) || state.first || state.over || state.won) return false;
    const c = state.cells[y * width + x];
    if (c.revealed) return false;
    if (!c.flag && state.flags >= state.mines) return false;
    c.flag = !c.flag;
    state.flags += c.flag ? 1 : -1;
    return true;
  }
  reset();
  return { state, reset, build, reveal, toggleFlag, neighbours };
}

export function createPairsEngine({
  pairs = 8,
  random = Math.random,
  now = Date.now,
} = {}) {
  const state = {
    cards: [],
    open: [],
    matched: 0,
    moves: 0,
    won: false,
    startedAt: null,
    elapsed: 0,
    paused: false,
  };
  let pausedAt = null,
    excluded = 0;
  function reset() {
    const values = Array.from({ length: pairs }, (_, i) => [i, i]).flat();
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    Object.assign(state, {
      cards: values.map((value, id) => ({
        id,
        value,
        open: false,
        matched: false,
      })),
      open: [],
      matched: 0,
      moves: 0,
      won: false,
      startedAt: null,
      elapsed: 0,
      paused: false,
    });
    pausedAt = null;
    excluded = 0;
    return state;
  }
  function tick() {
    if (state.startedAt !== null && !state.won)
      state.elapsed = Math.max(
        0,
        Math.floor(((pausedAt ?? now()) - state.startedAt - excluded) / 1000),
      );
    return state.elapsed;
  }
  function flip(id) {
    const c = state.cards[id];
    if (
      !c ||
      c.open ||
      c.matched ||
      state.open.length >= 2 ||
      state.won ||
      state.paused
    )
      return false;
    if (state.startedAt === null) state.startedAt = now();
    c.open = true;
    state.open.push(id);
    if (state.open.length === 2) {
      const [a, b] = state.open.map((i) => state.cards[i]);
      state.moves++;
      if (a.value === b.value) {
        a.matched = b.matched = true;
        state.matched++;
        state.open = [];
        if (state.matched === pairs) {
          tick();
          state.won = true;
        }
      }
    }
    return true;
  }
  function closeMismatched() {
    if (state.open.length !== 2) return false;
    state.open.forEach((id) => {
      state.cards[id].open = false;
    });
    state.open = [];
    return true;
  }
  function pause() {
    if (state.paused) return;
    tick();
    state.paused = true;
    pausedAt = now();
  }
  function resume() {
    if (!state.paused) return;
    if (state.startedAt !== null) excluded += now() - pausedAt;
    pausedAt = null;
    state.paused = false;
  }
  reset();
  return { state, reset, flip, closeMismatched, tick, pause, resume };
}
