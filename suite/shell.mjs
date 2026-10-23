import { apps } from './catalog.mjs';
import { normalizeKey, nextControl, createStorage } from './input.mjs';
import { drawGlyph } from './icons.mjs';
import './shell.css';

export function boot(modules, initial = null) {
  const host = document.getElementById('suite');
  host.innerHTML = `<header class="suite-header"><span class="suite-brand">democratizen<span> / </span><strong id="suite-title">Frame Apps</strong></span><button id="suite-home" hidden>Back to apps</button><span id="suite-count">12 apps. Yours to keep.</span></header><main id="suite-main"></main><footer class="suite-footer"><span id="suite-help">Arrows to browse · OK to open</span><span>Runs on your TV</span></footer><div class="suite-toast" id="suite-toast" role="status" hidden></div><div class="suite-modal" id="suite-modal" hidden role="dialog" aria-modal="true" aria-labelledby="suite-modal-title"><div><h2 id="suite-modal-title">Leave this app?</h2><p>Your saved records will stay on this TV.</p><div><button id="suite-stay">Stay here</button><button id="suite-leave">Leave app</button></div></div></div><div class="sr-only" id="suite-live" aria-live="polite"></div>`;
  const main = document.getElementById('suite-main'),
    home = document.getElementById('suite-home');
  const modal = document.getElementById('suite-modal');
  let active = null,
    activeId = null,
    lastApp = 'snake',
    modalFocus = null,
    toastTimer;
  const help = (text) => {
    document.getElementById('suite-help').textContent = text;
  };
  const announce = (text) => {
    document.getElementById('suite-live').textContent = text;
  };
  const toast = (text) => {
    const el = document.getElementById('suite-toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 5000);
    announce(text);
  };
  function visibleControls(scope = document) {
    return [
      ...scope.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),canvas[tabindex="0"],a[href]',
      ),
    ].filter(
      (el) =>
        el.tabIndex >= 0 &&
        el.getBoundingClientRect().width &&
        el.getBoundingClientRect().height &&
        !el.closest('[hidden],[inert]'),
    );
  }
  function appOverlay() {
    return main.querySelector(
      '.arcade-overlay:not([hidden]),.snake-overlay:not([hidden])',
    );
  }
  function focusFirst(scope = main) {
    (visibleControls(appOverlay() || scope)[0] || home).focus();
  }
  function exitPrompt() {
    active?.suspend?.();
    modalFocus = document.activeElement;
    modal.hidden = false;
    document.getElementById('suite-stay').focus();
  }
  function closePrompt() {
    modal.hidden = true;
    if (modalFocus?.isConnected && modalFocus.getBoundingClientRect().width)
      modalFocus.focus();
    else focusFirst();
  }
  function leave() {
    modal.hidden = true;
    if (initial) {
      try {
        window.tizen.application.getCurrentApplication().exit();
        return;
      } catch {
        /* Browser previews use the same return screen. */
      }
    }
    gallery();
  }
  function open(id) {
    if (!modules[id]) return;
    active?.destroy?.();
    active = null;
    activeId = id;
    lastApp = id;
    const app = apps.find((item) => item.id === id);
    document.title = app.name;
    document.getElementById('suite-title').textContent = app.name;
    document.getElementById('suite-count').hidden = true;
    home.hidden = false;
    home.textContent = initial ? 'Exit app' : 'Back to apps';
    main.className = 'suite-app-main';
    main.replaceChildren();
    const root = document.createElement('div');
    root.className = 'suite-app-root';
    main.append(root);
    let storage;
    try {
      storage = window.localStorage;
    } catch {
      /* The in-memory fallback still lets apps run. */
    }
    try {
      active = modules[id].mount(root, {
        storage: createStorage(id, storage, toast),
        setHelp: help,
        announce,
        exit: exitPrompt,
      });
      requestAnimationFrame(() => focusFirst(root));
      if (!initial) history.replaceState(null, '', `#${id}`);
    } catch (error) {
      console.error(error);
      root.replaceChildren();
      const p = document.createElement('p');
      p.textContent = 'This app could not start. Return to apps and try again.';
      root.append(p);
      home.focus();
      toast(error.message);
    }
  }
  function gallery() {
    active?.destroy?.();
    active = null;
    activeId = null;
    document.title = 'Frame Apps';
    document.getElementById('suite-title').textContent = 'Frame Apps';
    home.hidden = true;
    document.getElementById('suite-count').hidden = false;
    main.className = 'suite-gallery';
    main.innerHTML = `<aside class="suite-feature"><canvas width="320" height="320" aria-hidden="true"></canvas><div><p id="feature-category"></p><h1 id="feature-name"></h1><p id="feature-description"></p></div><p class="suite-feature-hint">Choose an app. Press OK.</p></aside><section class="suite-library" aria-label="Apps"></section>`;
    const library = main.querySelector('.suite-library');
    const feature = (app) => {
      main.querySelector('#feature-name').textContent = app.name;
      main.querySelector('#feature-category').textContent = app.category;
      main.querySelector('#feature-description').textContent = app.description;
      drawGlyph(main.querySelector('canvas'), app.icon, app.color);
    };
    for (const app of apps) {
      const button = document.createElement('button');
      button.className = 'suite-tile';
      button.dataset.app = app.id;
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      canvas.setAttribute('aria-hidden', 'true');
      const title = document.createElement('strong');
      title.textContent = app.name;
      const category = document.createElement('span');
      category.textContent = app.category;
      button.append(canvas, title, category);
      drawGlyph(canvas, app.icon, app.color);
      button.onclick = () => open(app.id);
      button.onfocus = () => feature(app);
      library.append(button);
    }
    help('Arrows to browse · OK to open · Back to exit');
    history.replaceState(null, '', location.pathname + location.search);
    const selected =
      library.querySelector(`[data-app="${lastApp}"]`) ||
      library.firstElementChild;
    selected.focus();
  }
  home.onclick = exitPrompt;
  document.getElementById('suite-stay').onclick = closePrompt;
  document.getElementById('suite-leave').onclick = leave;
  document.addEventListener('keydown', (event) => {
    const key = normalizeKey(event);
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === 'Enter' && event.repeat) {
      event.preventDefault();
      return;
    }
    if (
      document.activeElement?.dataset.adjusting === 'true' &&
      key === 'Escape'
    ) {
      document.activeElement.dataset.adjusting = 'false';
      event.preventDefault();
      announce('Adjustment saved');
      return;
    }
    const normalized = {
      key,
      code: event.code,
      repeat: event.repeat,
      shiftKey: event.shiftKey,
      originalEvent: event,
    };
    const focused = document.activeElement;
    if (!modal.hidden) {
      if (key === 'Escape') {
        event.preventDefault();
        closePrompt();
        return;
      }
    } else if (focused !== home && active?.handleKey?.(normalized)) {
      event.preventDefault();
      return;
    } else if (key === 'Escape') {
      event.preventDefault();
      if (activeId || initial) exitPrompt();
      else {
        try {
          window.tizen.application.getCurrentApplication().exit();
        } catch {
          toast('You are in the browser preview. Close this tab to leave.');
        }
      }
      return;
    }
    const scope = modal.hidden ? appOverlay() || document : modal;
    const controls = visibleControls(scope),
      current = document.activeElement;
    // Range sliders enter adjustment mode only on OK, so merely focusing never traps arrows.
    if (
      modal.hidden &&
      current?.tagName === 'INPUT' &&
      current.type === 'range'
    ) {
      if (key === 'Enter') {
        current.dataset.adjusting =
          current.dataset.adjusting === 'true' ? 'false' : 'true';
        announce(
          current.dataset.adjusting === 'true'
            ? 'Adjust with left and right. OK finishes.'
            : 'Adjustment saved',
        );
        event.preventDefault();
        return;
      }
      if (
        current.dataset.adjusting === 'true' &&
        ['ArrowLeft', 'ArrowRight'].includes(key)
      ) {
        current.stepUp(key === 'ArrowRight' ? 1 : -1);
        current.dispatchEvent(new Event('input', { bubbles: true }));
        current.dispatchEvent(new Event('change', { bubbles: true }));
        event.preventDefault();
        return;
      }
    }
    if (key.startsWith('Arrow')) {
      event.preventDefault();
      const rect = current?.getBoundingClientRect();
      const boxes = controls
        .filter((el) => el !== current)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, el };
        });
      const next = rect?.width
        ? nextControl(rect, boxes, key)?.el
        : controls[0];
      if (next) {
        next.focus();
        next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } else if (key === 'Enter') {
      if (current?.tagName === 'BUTTON' || current?.tagName === 'A') {
        event.preventDefault();
        if (!event.repeat) current.click();
      }
    } else if (key === 'Tab' && !modal.hidden) {
      event.preventDefault();
      const index = controls.indexOf(current);
      controls[
        (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
      ]?.focus();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) active?.suspend?.();
  });
  document.addEventListener('focusout', (event) => {
    if (event.target?.dataset) event.target.dataset.adjusting = 'false';
  });
  window.addEventListener('pagehide', () => active?.destroy?.());
  window.addEventListener('hashchange', () => {
    if (initial) return;
    const id = location.hash.slice(1);
    if (modules[id]) open(id);
    else gallery();
  });
  try {
    for (const key of ['MediaPlayPause', 'MediaPlay', 'MediaPause']) {
      try {
        window.tizen.tvinputdevice.registerKey(key);
      } catch {}
    }
  } catch {}
  const requested = initial || location.hash.slice(1);
  if (requested && modules[requested]) open(requested);
  else gallery();
}
