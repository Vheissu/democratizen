import { createMinesEngine } from '../engines/arcade.mjs';
import { arcadeUI } from './arcade-ui.mjs';
export function mount(root, context) {
  const ui = arcadeUI(root, context, {
    id: 'mines',
    title: 'Minefield',
    description: 'Read the clues. Leave the mines alone.',
    stats: [
      ['remaining', 'mines left'],
      ['safe', 'safe cells'],
      ['wins', 'fields cleared'],
    ],
    board:
      '<div class="arcade-grid mines-board" data-board aria-label="Minefield"></div>',
    side: '<h2>How to play</h2><p>Each number counts nearby mines. Open every safe cell to win.</p><p>Move to the Flag mode button on the right to change what OK does. Your first reveal is safe.</p><button data-flag aria-pressed="false">Flag mode: off</button><div class="spacer"></div><button data-pause>Pause</button><button data-restart>New field</button>',
  });
  const engine = createMinesEngine();
  let playing = false,
    paused = false,
    flagMode = false,
    wins = Number(context.storage.get('wins', 0)) || 0;
  const grid = ui.q('[data-board]');
  function draw(focusIndex) {
    const focused = document.activeElement;
    const previous = focused?.closest('.mine-cell')?.dataset.index;
    grid.replaceChildren();
    engine.state.cells.forEach((cell, i) => {
      const b = document.createElement('button');
      b.className = `mine-cell${cell.revealed ? ' open' : ''}${cell.flag ? ' flag' : ''}${cell.mine && cell.revealed ? ' mine' : ''}`;
      b.dataset.index = i;
      b.dataset.count = cell.count;
      b.textContent = cell.revealed
        ? cell.mine
          ? '×'
          : cell.count || ''
        : cell.flag
          ? 'F'
          : '';
      b.setAttribute(
        'aria-label',
        `Row ${cell.y + 1}, column ${cell.x + 1}: ${cell.revealed ? (cell.mine ? 'mine' : `${cell.count} nearby mines`) : cell.flag ? 'flagged' : 'hidden'}`,
      );
      b.onclick = () => act(i);
      grid.append(b);
    });
    ui.stat('remaining', engine.state.mines - engine.state.flags);
    ui.stat('safe', `${engine.state.revealed}/${80 - engine.state.mines}`);
    ui.stat('wins', wins);
    const index =
      focusIndex ?? (previous === undefined ? null : Number(previous));
    if (index !== null) grid.children[index]?.focus();
  }
  function toggleFlag() {
    flagMode = !flagMode;
    ui.q('[data-flag]').textContent = `Flag mode: ${flagMode ? 'on' : 'off'}`;
    ui.q('[data-flag]').setAttribute('aria-pressed', flagMode);
    context.announce(
      flagMode
        ? 'Flag mode. OK marks a mine.'
        : 'Reveal mode. OK opens a cell.',
    );
  }
  function start() {
    engine.reset();
    playing = true;
    paused = false;
    if (flagMode) toggleFlag();
    ui.hide();
    draw(0);
  }
  function resume() {
    paused = false;
    ui.hide();
    grid.querySelector('button')?.focus();
  }
  function pause() {
    if (!playing) return;
    paused = true;
    ui.menu('Paused', `Current action: ${flagMode ? 'flag' : 'reveal'}.`, [
      ['Resume', resume],
      [
        `Switch to ${flagMode ? 'reveal' : 'flag'} mode`,
        () => {
          toggleFlag();
          resume();
        },
      ],
      ['New field', start],
      ['Leave app', context.exit],
    ]);
  }
  function act(i) {
    if (!playing || paused) return;
    const c = engine.state.cells[i];
    if (flagMode && engine.state.first) {
      context.announce('Reveal a cell before placing flags.');
      return;
    }
    if (flagMode) engine.toggleFlag(c.x, c.y);
    else engine.reveal(c.x, c.y);
    draw(i);
    if (engine.state.won || engine.state.over) {
      playing = false;
      if (engine.state.won) {
        wins++;
        context.storage.set('wins', wins);
        ui.stat('wins', wins);
      }
      ui.menu(
        engine.state.won ? 'Field cleared' : 'Mine triggered',
        engine.state.won
          ? 'Every safe cell is open.'
          : 'The revealed mines show where the danger was.',
        [
          ['New field', start],
          ['Leave app', context.exit],
        ],
      );
      context.announce(engine.state.won ? 'Field cleared' : 'Mine triggered');
    }
  }
  ui.q('[data-flag]').onclick = toggleFlag;
  ui.q('[data-pause]').onclick = pause;
  ui.q('[data-restart]').onclick = start;
  draw();
  ui.menu(
    'Minefield',
    'Arrows choose a cell. OK reveals it. The Flag mode control marks suspected mines.',
    [['Start field', start]],
  );
  context.setHelp(
    'Arrows choose a cell/control · OK reveals or flags · Back pauses',
  );
  return {
    handleKey(e) {
      if (e.key === 'Escape' && playing && !paused) {
        pause();
        return true;
      }
      if ((e.key === 'f' || e.key === 'F') && playing && !paused) {
        toggleFlag();
        return true;
      }
      return false;
    },
    suspend() {
      if (playing && !paused) pause();
    },
    destroy() {
      root.replaceChildren();
    },
  };
}
