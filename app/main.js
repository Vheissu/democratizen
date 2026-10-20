import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { authenticateClient, unbase64 } from '../shared/crypto.mjs';
import '@xterm/xterm/css/xterm.css';
import './style.css';

const $ = id => document.getElementById(id);
const connection = window.FRAME_CONNECTION;
const stored = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
let fontSize = Math.max(14, Math.min(36, Number(stored('fontSize', 24)) || 24));
let selectedId = stored('session', null);
let activeId = null;
let sessions = [];
let socket, cipher, reconnectTimer, toastTimer, modalAction;
let ready = false, creating = false, controls = false, retryDelay = 1000;
let capabilities = {};
const unit = () => document.documentElement.style.setProperty('--unit', `${window.innerWidth / 1920}px`);
unit();
const term = new Terminal({
  cursorBlink: true, fontFamily: 'JetBrains, monospace', fontSize: fontSize * window.innerWidth / 1920,
  lineHeight: 1.18, scrollback: 2000, convertEol: false, allowProposedApi: false,
  theme: { background: '#111517', foreground: '#edf0eb', cursor: '#b2e4c4', selectionBackground: '#496555', black: '#263238', red: '#f28b82', green: '#b2e4c4', yellow: '#ebd59c', blue: '#8ab4f8', magenta: '#d1a3e8', cyan: '#9bd6d1', white: '#edf0eb', brightBlack: '#7b8b8e', brightRed: '#ffada5', brightGreen: '#d3f3dd', brightYellow: '#f8e5b6', brightBlue: '#b4ccff', brightMagenta: '#e4c4f4', brightCyan: '#c0e9e6', brightWhite: '#ffffff' }
});
const fit = new FitAddon();
term.loadAddon(fit);
term.open($('terminal'));
term.onData(data => { if (activeId && !controls && $('modal').hidden) send({ type: 'input', id: activeId, data }); });
term.onResize(({ cols, rows }) => {
  $('size').textContent = `${cols} × ${rows}`;
  if (activeId) send({ type: 'resize', id: activeId, cols, rows });
});
function resize() {
  unit();
  term.options.fontSize = fontSize * window.innerWidth / 1920;
  try { fit.fit(); } catch {}
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('terminal'));
document.fonts.ready.then(resize);
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}
function overlay(title, message, retry = false) {
  $('overlay').hidden = false;
  $('overlay-title').textContent = title;
  $('overlay-message').textContent = message;
  $('retry').hidden = !retry;
}
function send(message) {
  if (!ready || socket?.readyState !== WebSocket.OPEN || !cipher) return false;
  try { socket.send(cipher.seal(message)); return true; }
  catch { socket.close(); return false; }
}
function terminalFocus() {
  controls = false;
  $('hint').textContent = 'Keyboard ready · Ctrl Shift N: new session · Remote Back: controls';
  if (activeId && $('modal').hidden) term.focus();
}
function showControls() {
  controls = true; term.blur();
  $('hint').textContent = 'Controls · Use arrows and OK · Back returns to typing · Ctrl Shift ← / →: switch sessions';
  (document.querySelector('.session.selected') || $('new-session')).focus();
}
function render() {
  const previousFocus = document.activeElement?.dataset.session;
  $('sessions').replaceChildren();
  sessions.forEach((session, i) => {
    const button = document.createElement('button');
    button.className = `session${session.id === selectedId ? ' selected' : ''}${session.exited ? ' exited' : ''}${session.kind === 'tv' ? ' tv' : ''}`;
    button.dataset.nav = ''; button.dataset.session = session.id;
    button.setAttribute('aria-current', session.id === selectedId ? 'true' : 'false');
    const number = document.createElement('span'); number.className = 'number'; number.textContent = session.exited ? '○' : String(i + 1).padStart(2, '0');
    const label = document.createElement('span'); label.className = 'label'; label.textContent = session.name;
    const target = document.createElement('span'); target.className = 'session-target'; target.textContent = session.kind === 'tv' ? 'ROOT' : 'MAC';
    if (session.status === 'connecting' || session.status === 'closing') { target.textContent = session.status === 'connecting' ? '…' : 'CLOSING'; button.title = session.status; }
    button.append(number, label, target); button.addEventListener('click', () => attach(session.id));
    $('sessions').append(button);
    if (controls && previousFocus === session.id) button.focus();
  });
  $('session-count').textContent = `${sessions.length} / 8`;
  const selected = sessions.find(s => s.id === selectedId);
  $('target-label').textContent = selected?.kind === 'tv' ? 'TV ROOT /' : 'MAC /';
  $('target-label').classList.toggle('root', selected?.kind === 'tv');
  $('terminal').setAttribute('aria-label', selected?.kind === 'tv' ? 'TV root terminal' : 'Mac terminal');
  $('session-name').textContent = selected?.name || (ready ? 'Mac terminal' : 'Connecting');
  $('rename').disabled = !ready || !selected;
  $('close-session').disabled = !ready || !selected;
  $('new-session').disabled = !ready || sessions.length >= 8 || creating;
  $('tv-session').disabled = !ready || !capabilities.tvRoot || creating || (sessions.length >= 8 && !sessions.some(s => s.kind === 'tv' && !s.exited));
  $('tv-session').title = capabilities.tvRoot ? 'Open or return to the TV root shell · Ctrl Shift T' : 'Enable TV root support on the host: npm run tv:enable';
}
function attach(id) {
  if (!ready) return;
  selectedId = id; activeId = null;
  remember('session', id); render(); resize();
  overlay('Restoring session', 'Loading your terminal screen.');
  send({ type: 'attach', id, cols: term.cols, rows: term.rows });
}
function create(kind = 'mac') {
  if (!ready || creating) return;
  if (kind === 'tv') {
    const existing = sessions.find(s => s.kind === 'tv' && !s.exited);
    if (existing) { attach(existing.id); return; }
  }
  creating = true; render(); resize();
  send({ type: 'create', kind, cols: term.cols, rows: term.rows });
}
function updateSessions(next) {
  sessions = next;
  if (selectedId && !sessions.some(s => s.id === selectedId)) { selectedId = null; activeId = null; }
  render();
  if (!selectedId && sessions.length && !creating) attach(sessions[0].id);
  if (!sessions.length && !creating) overlay('Your Mac is connected', 'Create a session to open a shell. Each session runs independently.');
}
function receive(message) {
  switch (message.type) {
    case 'ready':
      ready = true; retryDelay = 1000; capabilities = message.capabilities || {};
      $('connection').textContent = message.hostname; $('connection').className = 'online';
      sessions = message.sessions; render();
      if (sessions.length) attach(sessions.some(s => s.id === selectedId) ? selectedId : sessions[0].id);
      else create();
      break;
    case 'sessions': updateSessions(message.sessions); break;
    case 'created': creating = false; attach(message.id); break;
    case 'attached':
      if (selectedId !== message.id) break;
      term.reset(); term.write(message.screen, () => {
        if (selectedId !== message.id) return;
        activeId = message.id; $('overlay').hidden = true; terminalFocus();
      });
      break;
    case 'data': if (selectedId === message.id) term.write(message.data); break;
    case 'error': creating = false; render(); toast(message.message); break;
  }
}
function connect() {
  clearTimeout(reconnectTimer);
  if (socket && socket.readyState < WebSocket.CLOSING) return;
  ready = false; creating = false; activeId = null; cipher = null; render();
  $('connection').textContent = 'Connecting…'; $('connection').className = '';
  overlay('Connecting to your Mac', `Looking for ${connection.host}. Your existing shells will be restored.`, true);
  const ws = new WebSocket(`ws://${connection.host}:${connection.port}/terminal`);
  socket = ws;
  const timeout = setTimeout(() => { if (!ready) ws.close(); }, 8000);
  ws.onmessage = event => {
    if (socket !== ws) return;
    try {
      if (!cipher) {
        const hello = JSON.parse(event.data);
        if (hello.type !== 'hello') throw new Error('Invalid server');
        unbase64(hello.challenge, 32);
        const auth = authenticateClient(hello.challenge, unbase64(connection.clientSecretKey, 32), unbase64(connection.hostPublicKey, 32));
        cipher = auth.cipher; ws.send(auth.packet);
      } else receive(cipher.open(event.data));
    } catch { toast('The paired connection could not be verified.'); ws.close(); }
  };
  ws.onerror = () => {};
  ws.onclose = () => {
    clearTimeout(timeout);
    if (socket !== ws) return;
    ready = false; creating = false; activeId = null; cipher = null; render();
    $('connection').textContent = 'Reconnecting…'; $('connection').className = '';
    overlay('Reconnecting to your Mac', 'Keep the Mac awake and on the same network. Sessions stay open while the Mac service is running.', true);
    reconnectTimer = setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 1.5, 15000);
  };
}
function openModal(kind) {
  const selected = sessions.find(s => s.id === selectedId);
  if (!selected || !ready) return;
  controls = true; term.blur(); $('modal').hidden = false;
  $('modal-title').textContent = kind === 'rename' ? 'Rename session' : `Close ${selected.name}?`;
  $('modal-message').textContent = kind === 'rename' ? 'Give this shell a name you can recognise.' : 'This ends the shell and any commands still running in it.';
  $('modal-input').hidden = kind !== 'rename'; $('modal-input').value = selected.name;
  $('modal-confirm').textContent = kind === 'rename' ? 'Save name' : 'Close session';
  modalAction = () => send(kind === 'rename' ? { type: 'rename', id: selected.id, name: $('modal-input').value } : { type: 'close', id: selected.id });
  if (kind === 'rename') { $('modal-input').focus(); $('modal-input').select(); } else $('modal-cancel').focus();
}
function dismissModal() { $('modal').hidden = true; modalAction = null; terminalFocus(); }
$('modal-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('modal-input').hidden && !$('modal-input').value.trim()) { toast('Enter a name for this session.'); return; }
  modalAction?.(); dismissModal();
});
$('modal-cancel').onclick = dismissModal;
$('new-session').onclick = () => create('mac');
$('tv-session').onclick = () => create('tv');
$('rename').onclick = () => openModal('rename');
$('close-session').onclick = () => openModal('close');
$('type').onclick = terminalFocus;
$('retry').onclick = () => { if (socket?.readyState === WebSocket.CONNECTING) socket.close(); else connect(); };
for (const [id, change] of [['smaller', -2], ['larger', 2]]) $(id).onclick = () => { fontSize = Math.max(14, Math.min(36, fontSize + change)); remember('fontSize', fontSize); resize(); terminalFocus(); };
const keys = { esc: '\x1b', tab: '\t', ctrlc: '\x03', ctrld: '\x04', up: '\x1b[A', down: '\x1b[B', left: '\x1b[D', right: '\x1b[C' };
document.querySelectorAll('[data-key]').forEach(button => { button.onclick = () => { if (activeId) send({ type: 'input', id: activeId, data: keys[button.dataset.key] }); terminalFocus(); }; });
function moveFocus(direction) {
  const modalOpen = !$('modal').hidden;
  const candidates = [...document.querySelectorAll(modalOpen ? '#modal [data-nav], #modal input' : '[data-nav]')].filter(el => !el.disabled && el.getClientRects().length && (modalOpen || !el.closest('#modal')));
  const current = document.activeElement;
  const rect = current?.getBoundingClientRect();
  if (!rect || !candidates.includes(current)) { candidates[0]?.focus(); return; }
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const choices = candidates.filter(el => el !== current).map(el => {
    const r = el.getBoundingClientRect(), dx = r.x + r.width / 2 - cx, dy = r.y + r.height / 2 - cy;
    const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    return { el, primary, score: primary + cross * 3 };
  }).filter(x => x.primary > 3).sort((a, b) => a.score - b.score);
  choices[0]?.el.focus();
}
document.addEventListener('keydown', event => {
  const code = event.keyCode;
  if (code === 10009) { event.preventDefault(); event.stopPropagation(); if (!$('modal').hidden) dismissModal(); else if (controls) terminalFocus(); else showControls(); return; }
  if (event.ctrlKey && event.shiftKey) {
    if (event.code === 'KeyN') { event.preventDefault(); event.stopPropagation(); create(); return; }
    if (event.code === 'KeyT' && capabilities.tvRoot) { event.preventDefault(); event.stopPropagation(); create('tv'); return; }
    if (event.code === 'KeyP') { event.preventDefault(); event.stopPropagation(); controls ? terminalFocus() : showControls(); return; }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation();
      const index = sessions.findIndex(s => s.id === selectedId), delta = event.key === 'ArrowLeft' ? -1 : 1;
      if (sessions.length) attach(sessions[(index + delta + sessions.length) % sessions.length].id);
      return;
    }
  }
  if (!$('modal').hidden && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismissModal(); return; }
  const field = document.activeElement?.tagName === 'INPUT';
  if ((controls || !$('modal').hidden || document.activeElement?.matches('button')) && !field) {
    const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (directions[event.key]) { event.preventDefault(); event.stopPropagation(); moveFocus(directions[event.key]); return; }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); document.activeElement?.click(); return; }
  }
  if (activeId && !controls && $('modal').hidden && (code === 65376 || code === 65385)) {
    event.preventDefault(); event.stopPropagation(); send({ type: 'input', id: activeId, data: code === 65376 ? '\r' : '\x1b' });
  }
}, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { resize(); if (!ready) connect(); else terminalFocus(); } });
$('terminal').addEventListener('mousedown', () => { controls = false; });
$('host-address').textContent = `${connection.host}:${connection.port}`;
resize(); connect();
