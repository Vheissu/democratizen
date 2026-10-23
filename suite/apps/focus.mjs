import {
  createTimer,
  resetTimer,
  updateTimer,
  startTimer,
  pauseTimer,
  timerText,
  clampNumber,
} from '../engines/studio.mjs';
import './studio.css';
export function mount(root, context) {
  let mode = context.storage.get('mode', 'work') === 'rest' ? 'rest' : 'work',
    work = clampNumber(context.storage.get('work', 25), 5, 90, 25),
    rest = clampNumber(context.storage.get('rest', 5), 1, 30, 5);
  const timer = createTimer((mode === 'work' ? work : rest) * 60);
  let completed = false;
  const day = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const sessions = () => {
    const saved = context.storage.get('sessions', {});
    return saved.day === day() ? Number(saved.count) || 0 : 0;
  };
  root.innerHTML =
    '<section class="studio-app focus-app"><header class="studio-head"><div><h1>Focus</h1><p>Give one thing your attention. Take a break when the time is up.</p></div><div class="studio-actions"><button data-mode="work">Work</button><button data-mode="rest">Break</button></div></header><div class="studio-main"><div class="studio-panel focus-clock"><p data-mode-label></p><div class="focus-time" data-time></div><p class="studio-muted" data-state>Ready</p><div class="studio-actions"><button data-toggle>Start work</button><button data-reset>Reset</button><button data-next hidden>Start break</button></div></div><aside class="studio-panel"><h2>Session length</h2><label>Work <strong data-work-label></strong> min<input data-work type="range" min="5" max="90" step="5"></label><label>Break <strong data-rest-label></strong> min<input data-rest type="range" min="1" max="30" step="1"></label><p class="studio-muted">OK adjusts a slider. Left/right changes it. OK finishes.</p><p class="studio-muted">Work sessions today</p><div class="studio-stat" data-sessions></div><button data-clear>Clear count</button></aside></div></section>';
  const q = (s) => root.querySelector(s);
  q('[data-work]').value = work;
  q('[data-rest]').value = rest;
  function render() {
    q('[data-time]').textContent = timerText(timer.remaining);
    q('[data-mode-label]').textContent =
      mode === 'work' ? 'Work session' : 'Break';
    q('[data-state]').textContent = timer.running
      ? 'Running'
      : completed
        ? 'Session complete'
        : timer.remaining === timer.total
          ? 'Ready'
          : 'Paused';
    q('[data-toggle]').textContent = timer.running
      ? 'Pause'
      : completed
        ? 'Start again'
        : timer.remaining === timer.total
          ? 'Start'
          : 'Resume';
    q('[data-work-label]').textContent = work;
    q('[data-rest-label]').textContent = rest;
    q('[data-sessions]').textContent = sessions();
    root
      .querySelectorAll('[data-mode]')
      .forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    q('[data-next]').hidden = !completed;
    q('[data-next]').textContent =
      mode === 'work' ? 'Start break' : 'Start work';
  }
  function reset() {
    resetTimer(timer, (mode === 'work' ? work : rest) * 60);
    completed = false;
    render();
  }
  function changeMode(next) {
    mode = next;
    context.storage.set('mode', mode);
    reset();
  }
  function update() {
    const wasRunning = timer.running;
    updateTimer(timer);
    if (wasRunning && !timer.running && timer.remaining === 0) {
      completed = true;
      if (mode === 'work')
        context.storage.set('sessions', { day: day(), count: sessions() + 1 });
      context.announce(
        `${mode === 'work' ? 'Work session' : 'Break'} complete`,
      );
    }
    render();
  }
  function pause() {
    update();
    pauseTimer(timer);
    render();
  }
  function toggle() {
    if (timer.running) pause();
    else {
      completed = false;
      startTimer(timer);
      render();
    }
  }
  q('[data-toggle]').onclick = toggle;
  q('[data-reset]').onclick = reset;
  q('[data-next]').onclick = () => {
    changeMode(mode === 'work' ? 'rest' : 'work');
    toggle();
  };
  q('[data-clear]').onclick = () => {
    context.storage.set('sessions', { day: day(), count: 0 });
    render();
  };
  root
    .querySelectorAll('[data-mode]')
    .forEach((b) => (b.onclick = () => changeMode(b.dataset.mode)));
  q('[data-work]').oninput = (e) => {
    work = Number(e.target.value);
    context.storage.set('work', work);
    if (mode === 'work') reset();
    else render();
  };
  q('[data-rest]').oninput = (e) => {
    rest = Number(e.target.value);
    context.storage.set('rest', rest);
    if (mode === 'rest') reset();
    else render();
  };
  const interval = setInterval(update, 250);
  render();
  context.setHelp('Arrows choose controls · OK selects/adjusts · Back pauses');
  return {
    handleKey(e) {
      if (e.key === 'Escape' && timer.running) {
        pause();
        return true;
      }
      if (e.key === ' ') {
        toggle();
        return true;
      }
      return false;
    },
    suspend() {
      if (timer.running) pause();
    },
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
