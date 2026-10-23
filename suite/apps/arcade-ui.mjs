import './arcade.css';

export function arcadeUI(
  root,
  context,
  { id, title, description, stats, board, side },
) {
  root.innerHTML = `<section class="arcade-app ${id}-app"><header class="arcade-head"><div><h1>${title}</h1><p>${description}</p></div><div class="arcade-stats">${stats.map(([key, label]) => `<div class="arcade-stat"><b data-stat="${key}">0</b><small>${label}</small></div>`).join('')}</div></header><div class="arcade-body"><div class="arcade-stage">${board}<div class="arcade-overlay" hidden><div class="arcade-menu"></div></div></div><aside class="arcade-side">${side}</aside></div></section>`;
  const q = (selector) => root.querySelector(selector),
    overlay = q('.arcade-overlay');
  function menu(title, copy, actions) {
    const panel = q('.arcade-menu');
    panel.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = title;
    const p = document.createElement('p');
    p.textContent = copy;
    panel.append(heading, p);
    actions.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = action;
      panel.append(button);
    });
    overlay.hidden = false;
    panel.querySelector('button')?.focus();
  }
  function hide() {
    overlay.hidden = true;
  }
  function stat(key, value) {
    q(`[data-stat="${key}"]`).textContent = value;
  }
  function boardFocus() {
    q('[data-board]')?.focus();
  }
  function onBoard() {
    return (
      document.activeElement?.tagName !== 'BUTTON' &&
      document.activeElement?.id !== 'suite-home'
    );
  }
  return { q, menu, hide, stat, boardFocus, onBoard };
}
