import { createPaddleEngine } from '../engines/arcade.mjs';
import { arcadeUI } from './arcade-ui.mjs';
export function mount(root, context) {
  const ui = arcadeUI(root, context, {
    id: 'paddle',
    title: 'Brick Breaker',
    description: 'Four walls of bricks. One paddle. Three lives.',
    stats: [
      ['score', 'score'],
      ['best', 'best'],
      ['lives', 'lives'],
      ['level', 'round'],
    ],
    board:
      '<canvas width="1000" height="600" data-board tabindex="-1" aria-label="Brick breaker board"></canvas>',
    side: '<h2>Keep it in play</h2><p>Left/right moves the paddle. OK serves the ball or pauses. Hit the paddle edges to change the angle.</p><p data-message>Press OK to serve.</p><div class="spacer"></div><button data-pause>Pause</button><button data-restart>New game</button>',
  });
  const engine = createPaddleEngine(),
    canvas = ui.q('canvas'),
    c = canvas.getContext('2d');
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
  function draw() {
    const s = engine.state;
    c.fillStyle = '#111819';
    c.fillRect(0, 0, 1000, 600);
    for (const b of s.bricks)
      if (!b.hit) {
        c.fillStyle = ['#b4c9dd', '#d7b58a', '#b6c994', '#da9f8e'][
          Math.floor(b.y / 4) % 4
        ];
        c.fillRect(b.x * 10, b.y * 10, b.w * 10 - 3, b.h * 10 - 3);
      }
    c.fillStyle = '#e6eada';
    c.fillRect((s.paddle.x - s.paddle.w / 2) * 10, 560, s.paddle.w * 10, 15);
    c.beginPath();
    c.arc(s.ball.x * 10, s.ball.y * 10, s.ball.r * 10, 0, Math.PI * 2);
    c.fill();
    save();
    ui.stat('score', s.score);
    ui.stat('best', best);
    ui.stat('lives', s.lives);
    ui.stat('level', Math.min(s.level, 4));
    ui.q('[data-message]').textContent = s.waiting
      ? 'Press OK to serve.'
      : 'Back pauses the game.';
  }
  function start() {
    engine.reset();
    playing = true;
    paused = false;
    elapsed = 0;
    last = 0;
    ui.hide();
    ui.boardFocus();
    draw();
  }
  function resume() {
    paused = false;
    last = 0;
    ui.hide();
    ui.boardFocus();
  }
  function pause() {
    if (!playing) return;
    paused = true;
    ui.menu('Paused', 'The ball will wait.', [
      ['Resume', resume],
      ['New game', start],
      ['Leave app', context.exit],
    ]);
  }
  function finish() {
    playing = false;
    save();
    ui.menu(
      engine.state.won ? 'All four rounds cleared' : 'Game over',
      `${engine.state.score} points`,
      [
        ['Play again', start],
        ['Leave app', context.exit],
      ],
    );
    context.announce(engine.state.won ? 'All rounds cleared' : 'Game over');
  }
  function loop(now) {
    if (playing && !paused) {
      if (last) elapsed += Math.min(now - last, 100);
      while (elapsed >= 1000 / 60) {
        engine.tick();
        elapsed -= 1000 / 60;
        if (engine.state.over || engine.state.won) {
          finish();
          break;
        }
      }
      draw();
    }
    last = now;
    raf = requestAnimationFrame(loop);
  }
  ui.q('[data-pause]').onclick = () => (paused ? resume() : pause());
  ui.q('[data-restart]').onclick = start;
  draw();
  ui.menu(
    'Brick Breaker',
    'Left and right move the paddle. Press OK to serve. Clear the bricks to reach the next round.',
    [['Start game', start]],
  );
  raf = requestAnimationFrame(loop);
  context.setHelp('← → move · OK serve/pause · Back pause');
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
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        engine.move(e.key === 'ArrowLeft' ? -4 : 4);
        draw();
        return true;
      }
      if (e.key === 'Enter') {
        if (!e.repeat) {
          if (engine.state.waiting) engine.serve();
          else pause();
        }
        return true;
      }
      return false;
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
