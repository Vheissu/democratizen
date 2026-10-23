import { breathPhase, BREATH_PATTERNS } from '../engines/studio.mjs';
import './studio.css';
export function mount(root, context) {
  let pattern = context.storage.get('pattern', 'box');
  if (!BREATH_PATTERNS[pattern]) pattern = 'box';
  let minutes = 3,
    running = false,
    elapsed = 0,
    started = 0,
    raf = 0;
  root.innerHTML =
    '<section class="studio-app breathe-app"><header class="studio-head"><div><h1>Breathe</h1><p>Follow the rhythm at your own pace. Stop whenever you want.</p></div><div class="studio-actions"><button data-pattern="box">Box 4–4–4–4</button><button data-pattern="easy">4–2–6–2</button><button data-pattern="even">Even 5–5</button></div></header><div class="studio-main"><div class="studio-panel breath-stage"><div class="breath-ring"><div class="breath-orb" data-orb><strong data-word>Ready</strong></div></div></div><aside class="studio-panel"><h2 data-pattern-name>Box breathing</h2><div class="studio-stat" data-left>4</div><p class="studio-muted">seconds in this phase</p><p class="studio-muted" data-session>3-minute session</p><div class="studio-choice"><button data-min="1">1 min</button><button data-min="3">3 min</button><button data-min="5">5 min</button></div><div class="studio-actions"><button data-start>Begin</button><button data-stop>Stop</button></div><p class="studio-muted" data-round>0 rounds</p></aside></div></section>';
  const q = (s) => root.querySelector(s),
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function render() {
    const part = breathPhase(elapsed, pattern),
      labels = ['Inhale', 'Hold', 'Exhale', 'Hold'];
    q('[data-word]').textContent = running
      ? labels[part.phase]
      : elapsed >= minutes * 60
        ? 'Complete'
        : 'Ready';
    q('[data-left]').textContent = running
      ? part.left
      : BREATH_PATTERNS[pattern][0];
    q('[data-round]').textContent = `${part.rounds} rounds`;
    q('[data-pattern-name]').textContent =
      pattern === 'box'
        ? 'Box breathing'
        : pattern === 'easy'
          ? 'Longer exhale'
          : 'Even breathing';
    q('[data-session]').textContent = running
      ? `${Math.max(0, Math.ceil(minutes * 60 - elapsed))} seconds left`
      : `${minutes}-minute session`;
    q('[data-start]').textContent = running ? 'Restart session' : 'Begin';
    let scale = 0.75;
    if (running) {
      scale =
        part.phase === 0
          ? 0.75 + part.progress * 0.35
          : part.phase === 1
            ? 1.1
            : part.phase === 2
              ? 1.1 - part.progress * 0.35
              : 0.75;
    }
    q('[data-orb]').style.transform = `scale(${reduced ? 1 : scale})`;
    root
      .querySelectorAll('[data-pattern]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', b.dataset.pattern === pattern),
      );
    root
      .querySelectorAll('[data-min]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', Number(b.dataset.min) === minutes),
      );
  }
  function stop() {
    running = false;
    render();
  }
  function start() {
    elapsed = 0;
    started = performance.now();
    running = true;
    render();
  }
  function loop(now) {
    if (running) {
      elapsed = (now - started) / 1000;
      if (elapsed >= minutes * 60) {
        elapsed = minutes * 60;
        running = false;
        context.announce('Breathing session complete');
      }
      render();
    }
    raf = requestAnimationFrame(loop);
  }
  root.querySelectorAll('[data-pattern]').forEach(
    (b) =>
      (b.onclick = () => {
        pattern = b.dataset.pattern;
        context.storage.set('pattern', pattern);
        elapsed = 0;
        stop();
      }),
  );
  root.querySelectorAll('[data-min]').forEach(
    (b) =>
      (b.onclick = () => {
        minutes = Number(b.dataset.min);
        elapsed = 0;
        stop();
      }),
  );
  q('[data-start]').onclick = start;
  q('[data-stop]').onclick = stop;
  render();
  raf = requestAnimationFrame(loop);
  context.setHelp('Choose a rhythm and duration · OK begins · Back stops');
  return {
    handleKey(e) {
      if (e.key === 'Escape' && running) {
        stop();
        return true;
      }
      if (e.key === ' ') {
        running ? stop() : start();
        return true;
      }
      return false;
    },
    suspend: stop,
    destroy() {
      cancelAnimationFrame(raf);
      root.replaceChildren();
    },
  };
}
