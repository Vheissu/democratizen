import { createPairsEngine } from '../engines/arcade.mjs';
import { arcadeUI } from './arcade-ui.mjs';
const symbols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export function mount(root, context) {
  const ui = arcadeUI(root, context, {
    id: 'pairs',
    title: 'Memory Pairs',
    description: 'Eight pairs. How much can you remember?',
    stats: [
      ['moves', 'moves'],
      ['time', 'time'],
      ['pairs', 'pairs'],
      ['best', 'best moves'],
    ],
    board:
      '<div class="arcade-grid pairs-board" data-board aria-label="Memory pairs"></div>',
    side: '<h2>Find the match</h2><p>Turn over two cards. Matches stay open. A wrong pair closes after a moment.</p><p>The timer begins on your first card and stops while paused.</p><div class="spacer"></div><button data-pause>Pause</button><button data-restart>New game</button>',
  });
  const engine = createPairsEngine();
  let playing = false,
    paused = false,
    timer = 0,
    closeTimer = 0,
    best = Number(context.storage.get('best', 0)) || 0;
  const grid = ui.q('[data-board]');
  function update() {
    ui.stat('moves', engine.state.moves);
    ui.stat('pairs', `${engine.state.matched}/8`);
    const s = engine.tick();
    ui.stat('time', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    ui.stat('best', best || '—');
  }
  function draw(focusIndex) {
    const previous =
      document.activeElement?.closest('.pair-card')?.dataset.index;
    grid.replaceChildren();
    engine.state.cards.forEach((card, i) => {
      const b = document.createElement('button');
      b.className = `pair-card${card.open ? ' open' : ''}${card.matched ? ' matched' : ''}`;
      b.dataset.index = i;
      b.dataset.symbol = card.open || card.matched ? symbols[card.value] : '';
      b.textContent = card.open || card.matched ? symbols[card.value] : '?';
      b.setAttribute(
        'aria-label',
        card.matched
          ? `Matched ${symbols[card.value]}`
          : card.open
            ? `Card ${symbols[card.value]}`
            : `Hidden card ${i + 1}`,
      );
      b.onclick = () => act(i);
      grid.append(b);
    });
    update();
    const index =
      focusIndex ?? (previous === undefined ? null : Number(previous));
    if (index !== null) grid.children[index]?.focus();
  }
  function closePair() {
    clearTimeout(closeTimer);
    if (engine.state.open.length === 2) {
      engine.closeMismatched();
      draw();
    }
  }
  function start() {
    clearTimeout(closeTimer);
    engine.reset();
    playing = true;
    paused = false;
    ui.hide();
    draw(0);
  }
  function resume() {
    engine.resume();
    paused = false;
    ui.hide();
    grid.querySelector('button')?.focus();
    if (engine.state.open.length === 2) closeTimer = setTimeout(closePair, 900);
  }
  function pause() {
    if (!playing) return;
    paused = true;
    engine.pause();
    clearTimeout(closeTimer);
    ui.menu('Paused', 'Your timer is stopped.', [
      ['Resume', resume],
      ['New game', start],
      ['Leave app', context.exit],
    ]);
  }
  function act(i) {
    if (!playing || paused || !engine.flip(i)) return;
    draw(i);
    if (engine.state.open.length === 2) {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(closePair, 900);
    }
    if (engine.state.won) {
      playing = false;
      if (!best || engine.state.moves < best) {
        best = engine.state.moves;
        context.storage.set('best', best);
      }
      update();
      ui.menu(
        'All pairs found',
        `${engine.state.moves} moves in ${engine.state.elapsed} seconds.`,
        [
          ['Play again', start],
          ['Leave app', context.exit],
        ],
      );
      context.announce('All pairs found');
    }
  }
  ui.q('[data-pause]').onclick = pause;
  ui.q('[data-restart]').onclick = start;
  draw();
  ui.menu(
    'Memory Pairs',
    'Arrows choose a card. OK turns it over. Find all eight pairs in as few moves as possible.',
    [['Start game', start]],
  );
  timer = setInterval(() => {
    if (playing && !paused) update();
  }, 250);
  context.setHelp(
    'Arrows choose a card/control · OK turns a card · Back pauses',
  );
  return {
    handleKey(e) {
      if (e.key === 'Escape' && playing && !paused) {
        pause();
        return true;
      }
      return false;
    },
    suspend() {
      if (playing && !paused) pause();
    },
    destroy() {
      clearInterval(timer);
      clearTimeout(closeTimer);
      root.replaceChildren();
    },
  };
}
