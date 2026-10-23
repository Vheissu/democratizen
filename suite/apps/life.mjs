import { lifeStep } from '../engines/studio.mjs';
import './studio.css';
export function mount(root, context) {
  const width = 48,
    height = 26;
  let grid = new Uint8Array(width * height),
    running = false,
    speed = 180,
    generation = 0,
    interval = 0,
    editing = false,
    cursor = [24, 13];
  root.innerHTML =
    '<section class="studio-app life-app"><header class="studio-head"><div><h1>Life Garden</h1><p>Draw a pattern, then let Conway’s rules take over.</p></div><div class="studio-actions"><button data-play>Start</button><button data-step>Step</button><button data-edit>Edit cells</button><button data-save>Save garden</button></div></header><div class="studio-main"><div class="studio-panel canvas-panel"><canvas width="960" height="520" tabindex="0" data-board aria-label="48 by 26 Conway game of life grid"></canvas></div><aside class="studio-panel life-tools"><div class="life-status" data-status></div><h2>Patterns</h2><div class="studio-choice"><button data-pattern="glider">Glider</button><button data-pattern="pulsar">Pulsar</button><button data-pattern="random">Random</button><button data-clear>Clear</button></div><label>Step interval <strong data-speed-label>180 ms</strong><input data-speed type="range" min="80" max="600" step="20" value="180"></label><p class="studio-muted">A live cell stays with two or three neighbours. Three neighbours bring an empty cell to life. Edges wrap.</p><p class="studio-muted" data-hint>Pause to edit. Back leaves edit mode.</p></aside></div></section>';
  const q = (s) => root.querySelector(s),
    canvas = q('canvas'),
    ctx = canvas.getContext('2d');
  function draw() {
    ctx.fillStyle = '#10180f';
    ctx.fillRect(0, 0, 960, 520);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (grid[y * width + x]) {
          ctx.fillStyle = '#c8df90';
          ctx.fillRect(x * 20 + 1, y * 20 + 1, 18, 18);
        } else {
          ctx.strokeStyle = '#c8df9010';
          ctx.lineWidth = 1;
          ctx.strokeRect(x * 20, y * 20, 20, 20);
        }
      }
    if (editing) {
      ctx.strokeStyle = '#fff3b5';
      ctx.lineWidth = 3;
      ctx.strokeRect(cursor[0] * 20 + 2, cursor[1] * 20 + 2, 16, 16);
    }
    q('[data-status]').textContent =
      `Generation ${generation} · ${grid.reduce((n, v) => n + v, 0)} alive`;
    q('[data-play]').textContent = running ? 'Pause' : 'Start';
    q('[data-edit]').textContent = editing ? 'Finish editing' : 'Edit cells';
  }
  function stop() {
    clearInterval(interval);
    running = false;
    draw();
  }
  function step() {
    grid = lifeStep(grid, width, height);
    generation++;
    draw();
  }
  function start() {
    if (running) return;
    editing = false;
    running = true;
    clearInterval(interval);
    interval = setInterval(step, speed);
    draw();
  }
  function edit(on) {
    stop();
    editing = on;
    draw();
    if (on) canvas.focus();
    else q('[data-edit]').focus();
  }
  function seed(name) {
    stop();
    grid.fill(0);
    generation = 0;
    const set = (x, y) => {
      grid[(13 + y) * width + 24 + x] = 1;
    };
    if (name === 'glider')
      [
        [0, -1],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ].forEach(([x, y]) => set(x, y));
    else if (name === 'pulsar') {
      for (const y of [-6, -1, 1, 6])
        for (const x of [-4, -3, -2, 2, 3, 4]) set(x, y);
      for (const x of [-6, -1, 1, 6])
        for (const y of [-4, -3, -2, 2, 3, 4]) set(x, y);
    } else
      for (let i = 0; i < grid.length; i++)
        grid[i] = Math.random() < 0.25 ? 1 : 0;
    draw();
  }
  q('[data-play]').onclick = () => (running ? stop() : start());
  q('[data-step]').onclick = () => {
    stop();
    step();
  };
  q('[data-edit]').onclick = () => edit(!editing);
  q('[data-clear]').onclick = () => {
    stop();
    grid.fill(0);
    generation = 0;
    draw();
  };
  q('[data-speed]').oninput = (e) => {
    const wasRunning = running;
    speed = Number(e.target.value);
    q('[data-speed-label]').textContent = `${speed} ms`;
    if (wasRunning) {
      stop();
      start();
    }
  };
  root
    .querySelectorAll('[data-pattern]')
    .forEach((b) => (b.onclick = () => seed(b.dataset.pattern)));
  q('[data-save]').onclick = () => {
    const saved = context.storage.set('garden', {
      grid: Array.from(grid),
      generation,
    });
    q('[data-hint]').textContent = saved
      ? 'Garden saved on this TV.'
      : 'Storage is unavailable. Keep this app open.';
  };
  canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect(),
      x = Math.floor(((e.clientX - r.left) / r.width) * width),
      y = Math.floor(((e.clientY - r.top) / r.height) * height);
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    stop();
    cursor = [x, y];
    editing = true;
    grid[y * width + x] ^= 1;
    canvas.focus();
    draw();
  };
  const saved = context.storage.get('garden', null);
  if (
    Array.isArray(saved?.grid) &&
    saved.grid.length === grid.length &&
    saved.grid.every((v) => v === 0 || v === 1)
  ) {
    grid = Uint8Array.from(saved.grid);
    generation =
      Number.isSafeInteger(saved.generation) && saved.generation >= 0
        ? saved.generation
        : 0;
    draw();
  } else seed('glider');
  context.setHelp(
    'Start/step the garden · Edit: arrows move, OK toggles · Back stops/finishes',
  );
  return {
    handleKey(e) {
      if (!editing) {
        if (e.key === 'Escape' && running) {
          stop();
          return true;
        }
        if (e.key === ' ') {
          running ? stop() : start();
          return true;
        }
        if (document.activeElement === canvas && e.key === 'Enter') {
          edit(true);
          return true;
        }
        return false;
      }
      if (e.key === 'Escape') {
        edit(false);
        return true;
      }
      const d = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[e.key];
      if (d) {
        cursor = [
          (cursor[0] + d[0] + width) % width,
          (cursor[1] + d[1] + height) % height,
        ];
        draw();
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        grid[cursor[1] * width + cursor[0]] ^= 1;
        draw();
        return true;
      }
      return false;
    },
    suspend() {
      stop();
      if (editing) edit(false);
    },
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
