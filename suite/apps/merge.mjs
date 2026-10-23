import { createMergeEngine } from '../engines/arcade.mjs';
import { arcadeUI } from './arcade-ui.mjs';
export function mount(root, context) {
  const ui = arcadeUI(root, context, {
    id: 'merge',
    title: 'Merge 2048',
    description: 'Make room for the next number.',
    stats: [
      ['score', 'score'],
      ['best', 'best'],
    ],
    board:
      '<div class="arcade-grid merge-board" data-board tabindex="-1" aria-label="2048 board"></div>',
    side: '<h2>Slide to combine</h2><p>Arrows slide every tile. Matching neighbours merge once per move. Reach 2048, or keep going.</p><p data-status>Your grid saves after every move.</p><div class="spacer"></div><button data-undo>Undo</button><button data-pause>Controls</button><button data-restart>New grid</button>',
  });
  const engine = createMergeEngine();
  engine.state.best = Number(context.storage.get('best', 0)) || 0;
  const restored = engine.restore(context.storage.get('save', null));
  let playing = false,
    paused = false,
    winShown = engine.state.won;
  function save() {
    context.storage.set('best', engine.state.best);
    context.storage.set('save', {
      board: engine.state.board,
      score: engine.state.score,
    });
  }
  function draw() {
    const grid = ui.q('[data-board]');
    grid.replaceChildren();
    engine.state.board.flat().forEach((value) => {
      const cell = document.createElement('div');
      cell.className = 'merge-tile';
      cell.dataset.value = value;
      cell.textContent = value || '';
      cell.setAttribute('aria-label', value || 'Empty');
      grid.append(cell);
    });
    ui.stat('score', engine.state.score);
    ui.stat('best', engine.state.best);
    ui.q('[data-undo]').disabled = !engine.state.history.length;
  }
  function resume() {
    playing = true;
    paused = false;
    ui.hide();
    ui.boardFocus();
    draw();
  }
  function start() {
    engine.reset();
    winShown = false;
    resume();
    save();
  }
  function undo() {
    if (engine.undo()) {
      save();
      draw();
      if (paused) pause();
    }
  }
  function pause() {
    if (!playing) return;
    paused = true;
    ui.menu('Grid controls', 'Resume, undo the last move, or start over.', [
      ['Resume', resume],
      ...(engine.state.history.length
        ? [
            [
              'Undo last move',
              () => {
                undo();
                resume();
              },
            ],
          ]
        : []),
      ['New grid', start],
      ['Leave app', context.exit],
    ]);
  }
  function move(direction) {
    if (!engine.move(direction)) return;
    draw();
    save();
    if (engine.state.over) {
      paused = true;
      ui.menu('No moves left', `${engine.state.score} points`, [
        ...(engine.state.history.length
          ? [
              [
                'Undo last move',
                () => {
                  undo();
                  resume();
                },
              ],
            ]
          : []),
        ['New grid', start],
        ['Leave app', context.exit],
      ]);
    } else if (engine.state.won && !winShown) {
      winShown = true;
      paused = true;
      ui.menu(
        '2048 reached',
        `${engine.state.score} points. You can keep building.`,
        [
          ['Keep going', resume],
          ['New grid', start],
        ],
      );
      context.announce('2048 reached');
    }
  }
  ui.q('[data-undo]').onclick = undo;
  ui.q('[data-pause]').onclick = pause;
  ui.q('[data-restart]').onclick = start;
  draw();
  ui.menu(
    'Merge 2048',
    'Arrows slide the board. Equal tiles join once per move. Back opens controls and Undo.',
    [
      ...(restored ? [['Continue saved grid', resume]] : []),
      ['New grid', start],
    ],
  );
  context.setHelp('Arrows slide · Back opens controls and Undo');
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
      const direction = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      }[e.key];
      if (direction) {
        move(direction);
        return true;
      }
      if (e.key === 'u' || e.key === 'U') {
        undo();
        return true;
      }
      return false;
    },
    suspend() {
      if (playing && !paused) pause();
    },
    destroy() {
      save();
      root.replaceChildren();
    },
  };
}
