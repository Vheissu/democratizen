/** Pure helpers shared by the studio apps. */
export function createTimer(total = 1500) {
  return {
    total,
    remaining: total,
    running: false,
    sessions: 0,
    deadline: null,
  };
}

export function updateTimer(timer, now = Date.now()) {
  if (!timer.running || timer.deadline === null) return timer;
  return tickTimer(
    timer,
    Math.max(
      0,
      timer.remaining - Math.max(0, Math.ceil((timer.deadline - now) / 1000)),
    ),
  );
}
export function startTimer(timer, now = Date.now()) {
  if (timer.remaining <= 0) timer.remaining = timer.total;
  timer.deadline = now + timer.remaining * 1000;
  timer.running = true;
  return timer;
}
export function pauseTimer(timer, now = Date.now()) {
  updateTimer(timer, now);
  timer.running = false;
  timer.deadline = null;
  return timer;
}

export function tickTimer(timer, seconds = 1) {
  if (!timer.running || seconds <= 0) return timer;
  const before = timer.remaining;
  timer.remaining = Math.max(0, timer.remaining - seconds);
  if (before > 0 && timer.remaining === 0) {
    timer.running = false;
    timer.sessions += 1;
  }
  return timer;
}

export function resetTimer(timer, total = timer.total) {
  timer.total = total;
  timer.remaining = total;
  timer.running = false;
  timer.deadline = null;
  return timer;
}

export function timerText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function lifeStep(grid, width, height) {
  const next = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const xx = (x + dx + width) % width,
            yy = (y + dy + height) % height;
          n += grid[yy * width + xx] ? 1 : 0;
        }
      const alive = !!grid[y * width + x];
      next[y * width + x] = alive ? n === 2 || n === 3 : n === 3 ? 1 : 0;
    }
  return next;
}

export function pixelHistory() {
  const past = [],
    future = [];
  return {
    push(value) {
      past.push(value.slice());
      if (past.length > 100) past.shift();
      future.length = 0;
      return value;
    },
    undo(current) {
      if (!past.length) return current;
      future.push(current.slice());
      return past.pop().slice();
    },
    redo(current) {
      if (!future.length) return current;
      past.push(current.slice());
      return future.pop().slice();
    },
    clear() {
      past.length = 0;
      future.length = 0;
    },
    get depth() {
      return past.length;
    },
  };
}

export const BREATH_PATTERNS = {
  box: [4, 4, 4, 4],
  easy: [4, 2, 6, 2],
  even: [5, 0, 5, 0],
};
export function breathPhase(elapsedSeconds, pattern = 'box') {
  const lengths = BREATH_PATTERNS[pattern] || BREATH_PATTERNS.box;
  const cycle = lengths.reduce((a, b) => a + b, 0);
  let within = Math.max(0, elapsedSeconds) % cycle;
  for (let phase = 0; phase < lengths.length; phase++) {
    if (lengths[phase] && within < lengths[phase])
      return {
        phase,
        progress: within / lengths[phase],
        left: Math.ceil(lengths[phase] - within),
        rounds: Math.floor(elapsedSeconds / cycle),
      };
    within -= lengths[phase];
  }
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function formatZone(date, zone, use24 = false) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !use24,
  }).format(date);
}
