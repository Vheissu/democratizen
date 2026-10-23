import { createBlocksEngine } from '../engines/arcade.mjs';
import { arcadeUI } from './arcade-ui.mjs';
const colors = [
  '#171b18',
  '#c8df90',
  '#b4c8dc',
  '#e2c679',
  '#df9a8a',
  '#c6b1cb',
  '#e9b67d',
  '#a6c7ae',
];
export function mount(root, context) {
  const ui = arcadeUI(root, context, {
    id: 'blocks',
    title: 'Falling Blocks',
    description: 'Fit the pieces. Clear a line. Make a little room.',
    stats: [
      ['score', 'score'],
      ['best', 'best'],
      ['lines', 'lines'],
      ['level', 'level'],
    ],
    board:
      '<canvas width="320" height="640" data-board tabindex="-1" aria-label="Falling blocks board"></canvas>',
    side: '<h2>Next piece</h2><canvas width="160" height="120" data-next aria-label="Next piece"></canvas><p>Left/right moves. Up rotates. Down lowers. OK drops the piece to the bottom.</p><p>Every ten lines raises the speed.</p><div class="spacer"></div><button data-pause>Pause</button><button data-restart>New game</button>',
  });
  const engine = createBlocksEngine(),
    canvas = ui.q('[data-board]'),
    ctx = canvas.getContext('2d'),
    next = ui.q('[data-next]').getContext('2d');
  let playing = false,
    paused = false,
    raf = 0,
    last = 0,
    elapsed = 0,
    best = Number(context.storage.get('best', 0)) || 0;
  function save() {
    if (engine.state.score > best) {
      best = engine.state.score;
      context.storage.set('best', best);
    }
  }
  function piece(c, shape, x, y, size, color) {
    c.fillStyle = color;
    shape.forEach((row, dy) =>
      row.forEach((v, dx) => {
        if (v)
          c.fillRect(x + dx * size + 2, y + dy * size + 2, size - 4, size - 4);
      }),
    );
  }
  function draw() {
    const s = engine.state,
      unit = 32;
    ctx.fillStyle = '#10170f';
    ctx.fillRect(0, 0, 320, 640);
    s.board.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v) piece(ctx, [[1]], x * unit, y * unit, unit, colors[v]);
      }),
    );
    if (s.active && !s.over) {
      const p = s.active;
      let y = p.y;
      while (!engine.collides(p, p.x, y + 1)) y++;
      ctx.globalAlpha = 0.18;
      piece(ctx, p.shape, p.x * unit, y * unit, unit, colors[p.color]);
      ctx.globalAlpha = 1;
      piece(ctx, p.shape, p.x * unit, p.y * unit, unit, colors[p.color]);
    }
    next.clearRect(0, 0, 160, 120);
    piece(
      next,
      s.next.shape,
      (160 - s.next.shape[0].length * 28) / 2,
      (120 - s.next.shape.length * 28) / 2,
      28,
      colors[s.next.color],
    );
    save();
    ui.stat('score', s.score);
    ui.stat('best', best);
    ui.stat('lines', s.lines);
    ui.stat('level', s.level);
  }
  function finish() {
    playing = false;
    save();
    ui.menu(
      'Game over',
      `${engine.state.score} points · ${engine.state.lines} lines`,
      [
        ['Play again', start],
        ['Leave app', context.exit],
      ],
    );
    context.announce('Game over');
  }
  function start() {
    engine.reset();
    playing = true;
    paused = false;
    elapsed = 0;
    last = 0;
    ui.hide();
    ui.q('[data-pause]').textContent = 'Pause';
    ui.boardFocus();
    draw();
  }
  function pause() {
    if (!playing) return;
    paused = true;
    ui.menu('Paused', 'OK resumes. Back again leaves the app.', [
      ['Resume', resume],
      ['New game', start],
      ['Leave app', context.exit],
    ]);
    ui.q('[data-pause]').textContent = 'Resume';
  }
  function resume() {
    paused = false;
    last = 0;
    ui.hide();
    ui.q('[data-pause]').textContent = 'Pause';
    ui.boardFocus();
  }
  function loop(now) {
    if (playing && !paused) {
      if (last) elapsed += Math.min(now - last, 100);
      if (elapsed >= Math.max(90, 700 - (engine.state.level - 1) * 55)) {
        engine.drop();
        elapsed = 0;
        draw();
        if (engine.state.over) finish();
      }
    }
    last = now;
    raf = requestAnimationFrame(loop);
  }
  ui.q('[data-pause]').onclick = () => (paused ? resume() : pause());
  ui.q('[data-restart]').onclick = start;
  ui.menu(
    'Falling Blocks',
    'Use the remote arrows to move and rotate. OK drops a piece. Back pauses.',
    [['Start game', start]],
  );
  draw();
  raf = requestAnimationFrame(loop);
  context.setHelp('← → move · ↑ rotate · ↓ lower · OK drop · Back pause');
  return {
    handleKey(e) {
      if (e.key === 'Escape' && playing && !paused) {
        pause();
        return true;
      }
      if (e.key === ' ' && playing) {
        paused ? resume() : pause();
        return true;
      }
      if (!playing || paused || !ui.onBoard()) return false;
      const actions = {
        ArrowLeft: () => engine.move(-1),
        ArrowRight: () => engine.move(1),
        ArrowUp: () => engine.rotate(),
        ArrowDown: () => engine.drop(),
        Enter: () => engine.hardDrop(),
      };
      if (!actions[e.key]) return false;
      if (e.key === 'Enter' && e.repeat) return true;
      actions[e.key]();
      draw();
      if (engine.state.over) finish();
      return true;
    },
    suspend() {
      if (playing && !paused) pause();
    },
    destroy() {
      cancelAnimationFrame(raf);
      save();
      root.replaceChildren();
    },
  };
}
