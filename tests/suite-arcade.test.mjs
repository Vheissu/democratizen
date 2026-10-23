import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlocksEngine,
  rotateMatrix,
  createPaddleEngine,
  mergeBoard,
  createMergeEngine,
  createMinesEngine,
  seededRandom,
  createPairsEngine,
} from '../suite/engines/arcade.mjs';

test('blocks rotate clockwise and clear a completed line', () => {
  const e = createBlocksEngine({ random: () => 0 });
  assert.deepEqual(
    rotateMatrix([
      [1, 0],
      [1, 1],
    ]),
    [
      [1, 1],
      [1, 0],
    ],
  );
  e.state.board[e.state.height - 1] = Array(e.state.width).fill(1);
  assert.equal(e.clearLines(), 1);
  assert.equal(
    e.state.board[e.state.height - 1].every((v) => v === 0),
    true,
  );
  e.reset();
  assert.equal(e.state.over, false);
  assert.ok(e.state.next);
});

test('blocks cannot reverse into a wall and hard drop locks', () => {
  const e = createBlocksEngine({ random: () => 0.5 });
  while (e.move(-1));
  e.hardDrop();
  assert.ok(e.state.board.flat().some(Boolean));
});

test('paddle engine keeps the paddle in bounds and removes bricks', () => {
  const e = createPaddleEngine();
  e.move(-1000);
  assert.equal(e.state.paddle.x, e.state.paddle.w / 2);
  e.move(1000);
  assert.equal(e.state.paddle.x, e.state.width - e.state.paddle.w / 2);
  assert.equal(e.state.bricks.length, 60);
});

test('merge slides toward each edge and merges a pair once', () => {
  assert.deepEqual(
    mergeBoard(
      [
        [2, 2, 2, 2],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      'left',
    )[0],
    [4, 4, 0, 0],
  );
  assert.deepEqual(
    mergeBoard(
      [
        [2, 2, 4, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      'right',
    )[0],
    [0, 0, 4, 4],
  );
});

test('merge engine supports undo and never changes a no-op move', () => {
  const e = createMergeEngine({ random: seededRandom(3) });
  const before = JSON.stringify(e.state.board);
  assert.equal(e.move('up'), true);
  assert.equal(e.undo(), true);
  assert.equal(JSON.stringify(e.state.board), before);
  assert.equal(e.move('diagonal'), false);
});

test('mines keeps the first reveal safe and floods zero regions', () => {
  const e = createMinesEngine({ random: seededRandom(4) });
  e.reveal(0, 0);
  assert.equal(e.state.first, false);
  assert.equal(e.state.cells[0].mine, false);
  assert.ok(e.state.revealed >= 1);
  const mine = e.state.cells.find((c) => c.mine && !c.revealed);
  assert.ok(mine);
  assert.equal(e.toggleFlag(mine.x, mine.y), true);
  assert.equal(e.state.flags, 1);
});

test('pairs shuffles two of every value and matches without a third card', () => {
  const e = createPairsEngine({ pairs: 4, random: seededRandom(8) });
  assert.equal(e.state.cards.length, 8);
  assert.equal(new Set(e.state.cards.map((c) => c.value)).size, 4);
  const first = e.state.cards[0].value;
  const other = e.state.cards.findIndex((c, i) => i > 0 && c.value === first);
  e.flip(0);
  e.flip(other);
  assert.equal(e.state.matched, 1);
  assert.equal(e.state.open.length, 0);
  assert.equal(e.state.moves, 1);
  assert.equal(e.flip(0), false);
});

test('blocks top out instead of discarding a piece above a full stack', () => {
  const e = createBlocksEngine({ random: () => 0 });
  e.state.board = Array.from({ length: 20 }, () => Array(10).fill(1));
  e.spawn();
  assert.equal(e.state.over, true);
});
test('merge scoring counts merges, not pre-existing tiles that slide into empty cells', () => {
  const e = createMergeEngine({ initial: false, random: seededRandom(2) });
  e.state.board = [
    [0, 0, 0, 8],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  e.move('left');
  assert.equal(e.state.score, 0);
  e.state.board = [
    [4, 4, 8, 8],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  e.state.score = 0;
  e.move('left');
  assert.equal(e.state.score, 24);
  assert.deepEqual(e.state.board[0].slice(0, 2), [8, 16]);
});
test('merge restores score and board and refuses malformed stored grids', () => {
  const e = createMergeEngine();
  const saved = {
    board: [
      [2, 2, 4, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    score: 44,
  };
  assert.equal(e.restore(saved), true);
  assert.equal(e.state.score, 44);
  assert.deepEqual(e.state.board, saved.board);
  saved.board[0][0] = 999;
  assert.equal(e.restore(saved), false);
  assert.equal(e.state.board[0][0], 2);
});
test('paddle waits for a serve, loses one life below the board and resets on restart', () => {
  const e = createPaddleEngine(),
    start = e.state.ball.y;
  e.tick();
  assert.equal(e.state.ball.y, start);
  e.serve();
  e.tick();
  assert.notEqual(e.state.ball.y, start);
  e.state.ball.y = 100;
  e.tick();
  assert.equal(e.state.lives, 2);
  assert.equal(e.state.waiting, true);
  e.move(20);
  e.reset();
  assert.equal(e.state.paddle.x, 50);
  assert.equal(e.state.lives, 3);
});
test('mines ignore out-of-bounds cells and flagged cells cannot trigger first-board generation', () => {
  const e = createMinesEngine();
  assert.equal(e.reveal(-1, 0), false);
  assert.equal(e.reveal(10, 0), false);
  assert.equal(e.state.first, true);
  e.reveal(4, 4);
  const neighbour = e.neighbours(4, 4);
  assert.ok(neighbour.every((p) => !e.state.cells[p.y * 10 + p.x].mine));
});
test('pair elapsed time excludes pauses and freezes on the final match', () => {
  let now = 1000;
  const e = createPairsEngine({ pairs: 1, random: () => 0, now: () => now });
  e.flip(0);
  now = 4000;
  e.pause();
  assert.equal(e.tick(), 3);
  now = 14000;
  assert.equal(e.tick(), 3);
  e.resume();
  now = 16000;
  e.flip(1);
  assert.equal(e.state.won, true);
  assert.equal(e.state.elapsed, 5);
  now = 20000;
  assert.equal(e.tick(), 5);
});
