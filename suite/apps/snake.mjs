import {
  DIRECTIONS,
  DIFFICULTIES,
  beginGame,
  createGame,
  dailySeed,
  pauseGame,
  setDirection,
  speedFor,
  stepGame,
} from '../engines/snake.mjs';
import './snake.css';

const modeCopy = {
  classic: {
    label: 'Classic',
    description:
      'The clean, familiar run. Wall and tail collisions end the round.',
  },
  expedition: {
    label: 'Expedition',
    description: 'Reach deeper sectors as barriers appear and the pace climbs.',
  },
  daily: {
    label: 'Daily',
    description:
      'One shared seeded board for today. Your best run is saved on this TV.',
  },
};

function dailyDay() {
  return new Date().toISOString().slice(0, 10);
}

function safeRecords(storage) {
  const value = storage?.get?.('frame-snake-records', {});
  return value && typeof value === 'object' ? value : {};
}

function formatScore(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(4, '0');
}

function button(doc, label, data = {}) {
  const node = doc.createElement('button');
  node.type = 'button';
  node.textContent = label;
  for (const [key, value] of Object.entries(data)) node.dataset[key] = value;
  return node;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function mount(root, context = {}) {
  const doc = root.ownerDocument || globalThis.document;
  root.className = 'snake-app';
  root.innerHTML = `
    <section class="snake-menu" data-screen="menu">
      <div class="snake-menu-copy">
        <h1>Snake</h1>
        <canvas class="snake-menu-preview" data-preview width="560" height="200" aria-hidden="true"></canvas>
        <p class="snake-muted">Eat, grow, and find a way through. Reach new sectors, use power-ups, and keep your best score.</p>
        <section class="snake-instructions" aria-labelledby="snake-instructions-label">
          <h2 id="snake-instructions-label">How to play</h2>
          <p><strong>S</strong> shields one crash. <strong>T</strong> slows time. <strong>+</strong> gives bonus points. Keep eating before the combo timer runs out. Every five foods raises your level.</p>
        </section>
      </div>
      <div class="snake-menu-panel">
        <section aria-labelledby="snake-mode-label">
          <h2 id="snake-mode-label">Choose a route</h2>
          <p class="snake-muted" data-mode-description></p>
          <div class="snake-choice-row" data-mode-buttons></div>
        </section>
        <section aria-labelledby="snake-pace-label">
          <h2 id="snake-pace-label">Set the pace</h2>
          <div class="snake-choice-row" data-difficulty-buttons></div>
        </section>
        <div class="snake-start-wrap">
          <button class="snake-start" type="button" data-start>Start run <span aria-hidden="true">↵</span></button>
          <span class="snake-record" data-menu-record>Best 0000</span>
        </div>
      </div>
    </section>
    <section class="snake-game" data-screen="game" hidden>
      <header class="snake-hud">
        <div class="snake-hud-group">
          <div class="snake-stat"><small>Score</small><strong data-score>0000</strong></div>
          <div class="snake-stat"><small>Best</small><strong data-best>0000</strong></div>
          <div class="snake-stat"><small>Sector</small><strong data-level>01</strong></div>
        </div>
        <div class="snake-hud-group">
          <div class="snake-stat"><small>Mode</small><strong data-mode>Classic</strong></div>
          <button type="button" data-pause>Pause</button>
          <button type="button" data-quit>Quit</button>
        </div>
      </header>
      <div class="snake-board-shell">
        <canvas class="snake-canvas" width="1120" height="640" tabindex="-1" aria-label="Snake game board"></canvas>
        <div class="snake-overlay" data-overlay hidden>
          <div class="snake-overlay-card">
            <strong data-overlay-title>Paused</strong>
            <span data-overlay-copy>Press OK or Space to continue.</span>
            <div class="snake-choice-row">
              <button type="button" data-overlay-action>Continue</button>
              <button type="button" data-overlay-menu>Back to menu</button>
            </div>
          </div>
        </div>
      </div>
      <p class="snake-help"><span data-status>Arrows move · OK pauses</span><span data-power></span></p>
    </section>
    <footer class="snake-help"><span>Frame arcade</span><span>Back pauses · Back again exits</span></footer>
  `;

  const menu = root.querySelector('[data-screen="menu"]');
  const game = root.querySelector('[data-screen="game"]');
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext?.('2d');
  const modeButtons = root.querySelector('[data-mode-buttons]');
  const difficultyButtons = root.querySelector('[data-difficulty-buttons]');
  const modeDescription = root.querySelector('[data-mode-description]');
  const menuRecord = root.querySelector('[data-menu-record]');
  const overlay = root.querySelector('[data-overlay]');
  const overlayTitle = root.querySelector('[data-overlay-title]');
  const overlayCopy = root.querySelector('[data-overlay-copy]');
  const overlayAction = root.querySelector('[data-overlay-action]');
  const overlayMenu = root.querySelector('[data-overlay-menu]');
  const scoreLabel = root.querySelector('[data-score]');
  const bestLabel = root.querySelector('[data-best]');
  const levelLabel = root.querySelector('[data-level]');
  const modeLabel = root.querySelector('[data-mode]');
  const statusLabel = root.querySelector('[data-status]');
  const powerLabel = root.querySelector('[data-power]');
  const pauseButton = root.querySelector('[data-pause]');
  const quitButton = root.querySelector('[data-quit]');
  const startButton = root.querySelector('[data-start]');
  const records = safeRecords(context.storage);
  let selectedMode = 'classic';
  let selectedDifficulty = 'steady';
  let state = null;
  let timer = null;
  let screen = 'menu';
  let endedSaved = false;
  let runRecordKey = null;

  function recordKey() {
    return screen === 'game' && runRecordKey
      ? runRecordKey
      : selectedMode === 'daily'
        ? `daily:${dailySeed()}:${selectedDifficulty}`
        : `${selectedMode}:${selectedDifficulty}`;
  }
  function best() {
    return Number(records[recordKey()] || 0);
  }
  function saveRecord() {
    if (!state || state.score <= best()) return;
    records[recordKey()] = state.score;
    context.storage?.set?.('frame-snake-records', records);
  }

  function updateModeButtons() {
    for (const node of modeButtons.querySelectorAll('button')) {
      const active = node.dataset.mode === selectedMode;
      node.dataset.active = String(active);
      node.setAttribute('aria-pressed', String(active));
    }
    for (const node of difficultyButtons.querySelectorAll('button')) {
      const active = node.dataset.difficulty === selectedDifficulty;
      node.dataset.active = String(active);
      node.setAttribute('aria-pressed', String(active));
    }
    modeDescription.textContent =
      selectedMode === 'daily'
        ? `${modeCopy.daily.description} UTC board: ${dailyDay()}.`
        : modeCopy[selectedMode].description;
    menuRecord.textContent = `Best ${formatScore(best())}`;
    const preview = root.querySelector('[data-preview]'),
      pc = preview.getContext('2d');
    pc.fillStyle = '#bdcd87';
    pc.fillRect(0, 0, 560, 200);
    pc.fillStyle = '#29371e';
    [
      [2, 4],
      [3, 4],
      [4, 4],
      [5, 4],
      [5, 3],
      [5, 2],
      [6, 2],
      [7, 2],
      [8, 2],
      [8, 3],
      [8, 4],
      [9, 4],
      [10, 4],
      [11, 4],
      [12, 4],
    ].forEach(([x, y]) => pc.fillRect(x * 30 + 8, y * 30 + 8, 23, 23));
    pc.fillStyle = '#bdcd87';
    pc.fillRect(12 * 30 + 21, 4 * 30 + 12, 4, 4);
    pc.fillRect(12 * 30 + 21, 4 * 30 + 23, 4, 4);
    pc.fillStyle = '#29371e';
    pc.fillRect(15 * 30 + 8, 4 * 30 + 8, 14, 14);
    if (selectedMode !== 'classic') {
      pc.fillStyle = '#6d7b44';
      [
        [2, 1],
        [3, 1],
        [4, 1],
        [11, 1],
        [12, 1],
      ].forEach(([x, y]) => pc.fillRect(x * 30 + 8, y * 30 + 8, 23, 23));
    }
  }

  for (const [mode, info] of Object.entries(modeCopy)) {
    const node = button(doc, info.label, { mode });
    node.addEventListener('click', () => {
      selectedMode = mode;
      updateModeButtons();
      context.announce?.(`${info.label} selected`);
    });
    modeButtons.append(node);
  }
  for (const [difficulty, info] of Object.entries(DIFFICULTIES)) {
    const node = button(doc, info.label, { difficulty });
    node.addEventListener('click', () => {
      selectedDifficulty = difficulty;
      updateModeButtons();
      context.announce?.(`${info.label} pace selected`);
    });
    difficultyButtons.append(node);
  }

  function setHelp() {
    context.setHelp?.(
      screen === 'menu'
        ? 'Snake · choose a route · OK starts'
        : 'Snake · arrows move · OK pauses · Back pauses/exits',
    );
  }

  function draw() {
    if (!ctx || !state) return;
    const cellW = canvas.width / state.width;
    const cellH = canvas.height / state.height;
    ctx.fillStyle = '#192119';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(200,223,144,.085)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cellW, 0);
      ctx.lineTo(x * cellW, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= state.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellH);
      ctx.lineTo(canvas.width, y * cellH);
      ctx.stroke();
    }
    ctx.fillStyle = '#55704c';
    for (const obstacle of state.obstacles)
      ctx.fillRect(
        obstacle.x * cellW + 3,
        obstacle.y * cellH + 3,
        cellW - 6,
        cellH - 6,
      );
    if (state.food) {
      const cx = (state.food.x + 0.5) * cellW;
      const cy = (state.food.y + 0.5) * cellH;
      ctx.fillStyle = '#e2f3b1';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.31, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8df90';
      ctx.fillRect(
        cx + cellW * 0.12,
        cy - cellH * 0.42,
        cellW * 0.12,
        cellH * 0.16,
      );
    }
    if (state.powerUp) {
      const cx = (state.powerUp.pos.x + 0.5) * cellW;
      const cy = (state.powerUp.pos.y + 0.5) * cellH;
      ctx.strokeStyle =
        state.powerUp.type === 'shield'
          ? '#e2f3b1'
          : state.powerUp.type === 'slow'
            ? '#8db7a4'
            : '#f0c970';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.37, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `bold ${Math.floor(cellH * 0.46)}px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        state.powerUp.type === 'shield'
          ? 'S'
          : state.powerUp.type === 'slow'
            ? 'T'
            : '+',
        cx,
        cy + 1,
      );
    }
    state.snake.forEach((part, index) => {
      const pad = index === 0 ? 2 : 4;
      const x = part.x * cellW + pad;
      const y = part.y * cellH + pad;
      ctx.fillStyle = index === 0 ? '#e2f3b1' : '#c8df90';
      roundRect(
        ctx,
        x,
        y,
        cellW - pad * 2,
        cellH - pad * 2,
        Math.min(7, cellW * 0.2),
      );
      ctx.fill();
      if (index === 0) {
        ctx.fillStyle = '#192119';
        const eye = Math.max(2, cellW * 0.09);
        const ex = state.direction.x
          ? state.direction.x > 0
            ? x + cellW * 0.68
            : x + cellW * 0.25
          : x + cellW * 0.32;
        const ey = state.direction.y
          ? state.direction.y > 0
            ? y + cellH * 0.68
            : y + cellH * 0.25
          : y + cellH * 0.3;
        ctx.fillRect(ex, ey, eye, eye);
        ctx.fillRect(
          ex + (state.direction.y ? cellW * 0.25 : 0),
          ey + (state.direction.x ? cellH * 0.25 : 0),
          eye,
          eye,
        );
      }
    });
  }

  function updateHud() {
    if (!state) return;
    scoreLabel.textContent = formatScore(state.score);
    bestLabel.textContent = formatScore(Math.max(best(), state.score));
    levelLabel.textContent = String(state.level).padStart(2, '0');
    modeLabel.textContent = modeCopy[state.mode].label;
    powerLabel.textContent = state.shield
      ? 'Shield ready'
      : state.slowTicks
        ? 'Time bend'
        : state.powerUp
          ? `${state.powerUp.type} on board`
          : state.combo > 1
            ? `${state.combo}× combo`
            : '';
    pauseButton.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
    statusLabel.textContent =
      state.status === 'running'
        ? 'Arrows move · OK pauses'
        : state.status === 'paused'
          ? 'Paused · OK resumes'
          : state.status === 'over'
            ? 'Run ended · choose what is next'
            : 'Board cleared';
  }

  function showOverlay(title, copy, actionLabel) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    overlayAction.textContent = actionLabel;
    overlay.hidden = false;
    overlayAction.focus?.();
  }
  function hideOverlay() {
    overlay.hidden = true;
  }

  function tick() {
    if (!state || state.status !== 'running') return;
    state = stepGame(state);
    if (state.status === 'over' || state.status === 'won') {
      if (!endedSaved) {
        saveRecord();
        endedSaved = true;
      }
      stopTimer();
      showOverlay(
        state.status === 'won' ? 'Board cleared' : 'Run over',
        `Score ${formatScore(state.score)} · best combo ${state.bestCombo}×`,
        'Run again',
      );
      context.announce?.(state.status === 'won' ? 'Board cleared' : 'Run over');
    }
    updateHud();
    draw();
    if (state.status === 'running') timer = setTimeout(tick, speedFor(state));
  }
  function startTimer() {
    stopTimer();
    timer = setTimeout(tick, speedFor(state));
  }
  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function startRun() {
    runRecordKey =
      selectedMode === 'daily'
        ? `daily:${dailySeed()}:${selectedDifficulty}`
        : `${selectedMode}:${selectedDifficulty}`;
    state = createGame({
      mode: selectedMode,
      difficulty: selectedDifficulty,
      seed: selectedMode === 'daily' ? dailySeed() : undefined,
    });
    beginGame(state);
    endedSaved = false;
    screen = 'game';
    menu.hidden = true;
    game.hidden = false;
    hideOverlay();
    updateHud();
    draw();
    setHelp();
    startTimer();
    canvas.focus?.();
    context.announce?.(`${modeCopy[selectedMode].label} run started`);
  }
  function togglePause() {
    if (!state || screen !== 'game') return;
    if (state.status === 'running') {
      pauseGame(state);
      stopTimer();
      showOverlay('Paused', 'Press OK or Space to continue.', 'Continue');
    } else if (state.status === 'paused') {
      beginGame(state);
      hideOverlay();
      startTimer();
      canvas.focus?.();
    }
    updateHud();
    draw();
  }
  function backToMenu() {
    stopTimer();
    saveRecord();
    state = null;
    screen = 'menu';
    game.hidden = true;
    menu.hidden = false;
    hideOverlay();
    updateModeButtons();
    setHelp();
    startButton.focus?.();
  }
  function overlayContinue() {
    if (state?.status === 'over' || state?.status === 'won') startRun();
    else togglePause();
  }
  startButton.addEventListener('click', startRun);
  pauseButton.addEventListener('click', togglePause);
  quitButton.addEventListener('click', backToMenu);
  overlayAction.addEventListener('click', overlayContinue);
  overlayMenu.addEventListener('click', backToMenu);
  updateModeButtons();
  setHelp();

  function handleKey(event) {
    const key = event?.key;
    if (screen === 'menu') {
      if (key === 'Enter' || key === ' ') {
        const focused = root.querySelector(':focus');
        if (focused?.tagName === 'BUTTON') {
          focused.click();
          return true;
        }
      }
      return false;
    }
    if (state?.status === 'running') {
      if (key === 'ArrowUp') {
        setDirection(state, DIRECTIONS.up);
        return true;
      }
      if (key === 'ArrowRight') {
        setDirection(state, DIRECTIONS.right);
        return true;
      }
      if (key === 'ArrowDown') {
        setDirection(state, DIRECTIONS.down);
        return true;
      }
      if (key === 'ArrowLeft') {
        setDirection(state, DIRECTIONS.left);
        return true;
      }
      if (key === 'Enter' || key === ' ') {
        togglePause();
        return true;
      }
      if (key === 'Escape') {
        togglePause();
        return true;
      }
      return false;
    }
    if (state?.status === 'paused') {
      if (key === ' ') {
        togglePause();
        return true;
      }
      if (key === 'Escape') return false;
      return false;
    }
    if (state?.status === 'over' || state?.status === 'won') {
      if (key === ' ') {
        overlayContinue();
        return true;
      }
      if (key === 'Escape') return false;
    }
    return false;
  }
  function suspend() {
    if (state?.status === 'running') togglePause();
  }
  function destroy() {
    stopTimer();
    saveRecord();
    root.replaceChildren();
  }
  return { handleKey, destroy, suspend };
}
