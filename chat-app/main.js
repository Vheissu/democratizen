import { marked } from 'marked';
import DOMPurify from 'dompurify';
import QRCode from 'qrcode';
import { authenticateClient, unbase64 } from '../shared/crypto.mjs';
import './style.css';

const $ = id => document.getElementById(id);
const connection = window.FRAME_CHAT_CONNECTION;
const requests = new Map();
let socket, cipher, retryTimer, toastTimer, ready = false, sequence = 0, retryDelay = 1000;
let chats = [], models = [], account = null, active = null, selectedId = localStorage.getItem('frame-chat-id');
let modalKind = '', textSize = Number(localStorage.getItem('frame-chat-text-size')) || 28;
let userScrolled = false, renderFrame = null, submitting = false;
function units() {
  document.documentElement.style.setProperty('--u', `${window.innerWidth / 1920}px`);
  document.documentElement.style.setProperty('--text-size', `${textSize * window.innerWidth / 1920}px`);
}
units(); window.addEventListener('resize', units);
function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function request(type, payload = {}) {
  if (!ready) return Promise.reject(new Error('Connecting to the Mac. Please try again in a moment.'));
  const id = `${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('The request took too long. Reconnect and check your chat before sending again.')); }, 60000);
    requests.set(id, { resolve, reject, timer });
    try { socket.send(cipher.seal({ id, type, ...payload })); } catch { clearTimeout(timer); requests.delete(id); reject(new Error('Connection lost. Your chats stay on the Mac.')); }
  });
}
function safely(action) { return (...args) => Promise.resolve().then(() => action(...args)).catch(error => toast(error.message)); }
function status(data) {
  const previousAccount = account?.email;
  account = data.account; models = data.models; chats = data.chats;
  if (previousAccount && previousAccount !== account?.email) { active = null; selectedId = null; localStorage.removeItem('frame-chat-id'); renderMessages(); }
  $('account-label').textContent = account ? `ChatGPT ${account.plan ? account.plan.charAt(0).toUpperCase() + account.plan.slice(1) : 'account'}` : 'Sign in to start chatting';
  $('plan-label').textContent = account ? 'Subscription connected' : 'Use your ChatGPT subscription';
  $('account-button').textContent = account ? 'Account' : 'Sign in with ChatGPT';
  fillModels(); renderSidebar(); controls();
}
function fillModels() {
  const selected = active?.model || $('model').value || models.find(m => m.isDefault)?.id || models[0]?.id;
  $('model').replaceChildren();
  for (const model of models) { const option = document.createElement('option'); option.value = model.id; option.textContent = model.name; $('model').append(option); }
  if (selected) $('model').value = selected;
  fillEfforts();
}
function fillEfforts() {
  const model = models.find(m => m.id === $('model').value);
  const selected = active?.model === model?.id ? active.effort : model?.effort;
  $('effort').replaceChildren();
  for (const effort of model?.efforts || []) {
    const option = document.createElement('option'); option.value = effort; option.textContent = effort.charAt(0).toUpperCase() + effort.slice(1); $('effort').append(option);
  }
  if (selected) $('effort').value = selected;
}
function renderSidebar() {
  const focusedId = document.activeElement?.dataset.chatId;
  $('chats').replaceChildren();
  for (const chat of chats) {
    const button = document.createElement('button');
    button.dataset.chatId = chat.id; button.dataset.nav = ''; button.className = chat.id === selectedId ? 'active' : '';
    button.textContent = chat.title; button.title = chat.title; button.setAttribute('aria-current', chat.id === selectedId ? 'true' : 'false');
    button.onclick = safely(() => selectChat(chat.id));
    $('chats').append(button); if (focusedId === chat.id) button.focus();
  }
}
function controls() {
  const busy = active?.status === 'thinking';
  $('send').hidden = !!busy; $('stop').hidden = !busy;
  $('send').disabled = !ready || !account || submitting;
  $('new-chat').disabled = !ready;
  $('model').disabled = !ready || !!busy; $('effort').disabled = !ready || !!busy;
  $('rename').disabled = !ready || !active; $('remove').disabled = !ready || !active || !!busy;
  $('prompt').placeholder = account ? 'Ask anything' : 'Sign in with ChatGPT to start';
  $('reply-status').textContent = active?.error || (busy ? 'Thinking…' : active?.status === 'interrupted' ? 'Reply stopped. You can continue the conversation.' : '');
}
function renderMessages() {
  $('welcome').hidden = !!active?.messages.length;
  const existing = new Map([...$('messages').children].map(node => [node.dataset.id, node]));
  const liveIds = new Set();
  for (const message of active?.messages || []) {
    liveIds.add(message.id);
    let node = existing.get(message.id);
    if (!node) { node = document.createElement('article'); node.dataset.id = message.id; node.className = `message ${message.role}`; node.setAttribute('aria-label', message.role === 'user' ? 'You' : 'Assistant'); $('messages').append(node); }
    if (node.dataset.text !== message.text) {
      node.dataset.text = message.text;
      if (message.role === 'user') node.textContent = message.text;
      else {
        node.innerHTML = DOMPurify.sanitize(marked.parse(message.text, { async: false, breaks: true }), { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'], ALLOWED_ATTR: ['href', 'title'] });
        for (const link of node.querySelectorAll('a')) {
          const href = link.getAttribute('href') || '';
          if (!/^https?:\/\//i.test(href)) link.removeAttribute('href');
          link.rel = 'noopener noreferrer'; link.target = '_blank';
        }
      }
    }
  }
  for (const [id, node] of existing) if (!liveIds.has(id)) node.remove();
  controls();
  if (!userScrolled) $('conversation').scrollTop = $('conversation').scrollHeight;
}
function scheduleRender() { if (renderFrame) return; renderFrame = requestAnimationFrame(() => { renderFrame = null; renderMessages(); }); }
$('conversation').addEventListener('scroll', () => { const el = $('conversation'); userScrolled = el.scrollHeight - el.scrollTop - el.clientHeight > 100; });
async function selectChat(id) {
  const chat = await request('chat.read', { chatId: id });
  selectedId = id; active = chat; localStorage.setItem('frame-chat-id', id); userScrolled = false;
  fillModels(); renderSidebar(); renderMessages(); $('prompt').focus();
}
function newChat() {
  active = null; selectedId = null; localStorage.removeItem('frame-chat-id'); userScrolled = false;
  renderSidebar(); renderMessages(); $('prompt').value = ''; $('prompt').focus();
}
async function sendMessage(event) {
  event?.preventDefault();
  if (active?.status === 'thinking' || submitting) return;
  if (!account) { await signIn(); return; }
  const text = $('prompt').value.trim(); if (!text) return;
  submitting = true;
  $('send').disabled = true;
  try {
    if (!active) {
      active = await request('chat.create', { model: $('model').value, effort: $('effort').value });
      selectedId = active.id; localStorage.setItem('frame-chat-id', active.id); renderSidebar();
    }
    $('prompt').value = ''; userScrolled = false;
    const requestId = (window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const chat = await request('chat.send', { chatId: active.id, text, requestId });
    if (chat.id === selectedId) { active = chat; renderMessages(); }
  } catch (error) { if (!$('prompt').value) $('prompt').value = text; toast(error.message); }
  finally { submitting = false; }
  controls();
}
function closeModal() { $('modal').hidden = true; modalKind = ''; $('prompt').focus(); }
function modal(title, kind = '') {
  modalKind = kind; $('modal-title').textContent = title; $('modal-body').replaceChildren(); $('modal-actions').replaceChildren(); $('modal').hidden = false;
  $('modal-close').focus();
}
function paragraph(text) { const p = document.createElement('p'); p.textContent = text; $('modal-body').append(p); return p; }
function action(text, handler) { const button = document.createElement('button'); button.textContent = text; button.dataset.nav = ''; button.onclick = safely(handler); $('modal-actions').append(button); return button; }
async function signIn() {
  modal('Sign in with ChatGPT', 'login'); paragraph('Getting a secure sign-in code…');
  try {
    const login = await request('login.start');
    if (modalKind !== 'login') return;
    if (login.pending) { paragraph('A sign-in request is starting. Close this dialog and try again in a moment.'); return; }
    $('modal-body').replaceChildren(); paragraph('Scan this code with your phone, then enter the code below. Sign in with the ChatGPT account whose subscription you want to use.');
    const details = document.createElement('div'); details.className = 'login-details';
    const qr = document.createElement('img'); qr.alt = 'QR code for the official OpenAI sign-in page'; qr.src = await QRCode.toDataURL(login.verificationUrl, { width: 250, margin: 1 });
    const text = document.createElement('div'); const url = document.createElement('div'); url.className = 'login-url'; url.textContent = login.verificationUrl;
    const code = document.createElement('div'); code.className = 'login-code'; code.textContent = login.userCode;
    text.append(url, code); details.append(qr, text); $('modal-body').append(details);
    paragraph('The TV will update when sign-in finishes. If OpenAI asks, enable device-code sign-in in your ChatGPT security settings.');
    action('Cancel sign-in', async () => { await request('login.cancel'); closeModal(); });
  } catch (error) { $('modal-body').replaceChildren(); paragraph(error.message); action('Try again', signIn); }
}
function receive(message) {
  if (message.type === 'result' || message.type === 'error') {
    const pending = requests.get(message.id); if (!pending) return;
    clearTimeout(pending.timer); requests.delete(message.id);
    message.type === 'error' ? pending.reject(new Error(message.message)) : pending.resolve(message.result); return;
  }
  if (message.type === 'ready') {
    ready = true; retryDelay = 1000; $('connection-label').textContent = 'Mac connected'; $('connection-dot').className = 'online';
    status(message);
    if (selectedId && chats.some(c => c.id === selectedId)) selectChat(selectedId).catch(error => toast(error.message));
    diagnostics(); return;
  }
  if (message.type === 'status') status(message);
  if (message.type === 'chats') { chats = message.chats; renderSidebar(); }
  if (message.type === 'chat' && message.chat.id === selectedId) { active = message.chat; renderMessages(); }
  if (message.type === 'delta' && message.chatId === selectedId && active) {
    let item = active.messages.find(m => m.id === message.itemId);
    if (!item) { item = { id: message.itemId, role: 'assistant', text: '' }; active.messages.push(item); }
    item.text += message.text; scheduleRender();
  }
  if (message.type === 'loginComplete') {
    if (message.success) { closeModal(); toast('Signed in. You’re ready to chat.'); }
    else toast(message.error || 'Sign-in was cancelled.');
  }
  if (message.type === 'fatal') toast(message.message);
}
function diagnostics() {
  if (ready) request('diagnostics', { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, appVersion: '0.1.0', buildId: connection.buildId, renderedMessages: $('messages').children.length }).catch(() => {});
}
function connect() {
  clearTimeout(retryTimer); ready = false; cipher = null; controls();
  $('connection-label').textContent = 'Connecting to Mac…'; $('connection-dot').className = '';
  socket = new WebSocket(`ws://${connection.host}:${connection.port}/chat`);
  socket.addEventListener('message', event => {
    try {
      if (!cipher) {
        const hello = JSON.parse(event.data); if (hello.type !== 'hello') throw new Error('Pairing failed');
        const auth = authenticateClient(hello.challenge, unbase64(connection.clientSecretKey, 32), unbase64(connection.hostPublicKey, 32));
        cipher = auth.cipher; socket.send(auth.packet); return;
      }
      receive(cipher.open(event.data));
    } catch { socket.close(); toast('The secure connection could not be verified.'); }
  });
  socket.addEventListener('close', () => {
    ready = false; controls(); $('connection-label').textContent = 'Reconnecting to Mac…'; $('connection-dot').className = '';
    for (const p of requests.values()) { clearTimeout(p.timer); p.reject(new Error('Connection lost. Check the saved chat before resending.')); } requests.clear();
    retryTimer = setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 1.5, 12000);
  });
  socket.addEventListener('error', () => {});
}
$('new-chat').onclick = newChat;
$('composer').onsubmit = safely(sendMessage);
$('stop').onclick = safely(() => request('chat.stop', { chatId: active.id }));
$('modal-close').onclick = closeModal;
$('account-button').onclick = safely(async () => {
  if (!account) return signIn();
  modal('Your ChatGPT account'); paragraph(`${account.email || 'Signed in'} · ${account.plan || 'ChatGPT'} plan`);
  paragraph('Frame Chat keeps its login separate from the Mac desktop app. Chats are saved on this Mac; they do not appear in your ChatGPT web history.');
  action('Sign out of Frame Chat', async () => { await request('logout'); closeModal(); }); action('Done', closeModal);
});
$('rename').onclick = () => {
  if (!active) return;
  modal('Name this chat'); const input = document.createElement('input'); input.setAttribute('aria-label', 'Chat name'); input.value = active.title; input.maxLength = 100; input.dataset.nav = ''; $('modal-body').append(input);
  action('Save name', async () => { await request('chat.rename', { chatId: active.id, title: input.value }); closeModal(); }); input.focus(); input.select();
};
$('remove').onclick = () => {
  if (!active) return;
  modal('Archive this chat?'); paragraph('It will be removed from the TV list. A copy stays in the Mac’s private archive.');
  action('Archive chat', async () => { await request('chat.remove', { chatId: active.id }); closeModal(); newChat(); }); action('Keep chatting', closeModal);
};
$('help').onclick = () => {
  modal('Keyboard & remote');
  paragraph('Keyboard: Enter sends. Shift Enter adds a line. Ctrl N starts a new chat. Ctrl L focuses the message box. Escape closes a dialog.');
  paragraph('Remote: Back opens the controls. Arrow keys move between buttons; OK selects. Focus the conversation and use Up or Down to scroll. Press Back again to return to typing.');
  paragraph('Frame Chat is a personal client powered by Codex. The Mac must remain awake and connected. USB keyboards work through the TV’s normal input system.');
  action('Done', closeModal);
};
for (const [id, delta] of [['smaller', -2], ['larger', 2]]) $(id).onclick = () => { textSize = Math.max(20, Math.min(42, textSize + delta)); localStorage.setItem('frame-chat-text-size', textSize); units(); };
$('model').onchange = safely(async () => { fillEfforts(); if (active) { active = await request('chat.model', { chatId: active.id, model: $('model').value, effort: $('effort').value }); controls(); } });
$('effort').onchange = safely(async () => { if (active) active = await request('chat.model', { chatId: active.id, model: $('model').value, effort: $('effort').value }); });
for (const button of document.querySelectorAll('[data-prompt]')) button.onclick = () => { $('prompt').value = button.dataset.prompt; $('prompt').focus(); };
function remoteMove(direction) {
  const root = $('modal').hidden ? document : $('modal');
  const options = [...root.querySelectorAll('[data-nav]')].filter(el => !el.disabled && el.getClientRects().length);
  const current = document.activeElement;
  if (!options.includes(current)) { options[0]?.focus(); return; }
  const from = current.getBoundingClientRect(), x = from.x + from.width / 2, y = from.y + from.height / 2;
  const candidates = options.filter(el => el !== current).map(el => {
    const r = el.getBoundingClientRect(), dx = r.x + r.width / 2 - x, dy = r.y + r.height / 2 - y;
    const primary = direction === 'Left' ? -dx : direction === 'Right' ? dx : direction === 'Up' ? -dy : dy;
    return { el, primary, score: primary + Math.abs(direction === 'Left' || direction === 'Right' ? dy : dx) * 2 };
  }).filter(x => x.primary > 2).sort((a, b) => a.score - b.score);
  candidates[0]?.el.focus();
}
document.addEventListener('keydown', event => {
  const code = event.keyCode, target = document.activeElement;
  if (code === 10009) { event.preventDefault(); if (!$('modal').hidden) closeModal(); else if (target === $('prompt')) $('new-chat').focus(); else $('prompt').focus(); return; }
  if (event.key === 'Escape' || code === 65385) { if (!$('modal').hidden) { event.preventDefault(); closeModal(); } return; }
  if (event.ctrlKey && event.code === 'KeyN') { event.preventDefault(); newChat(); return; }
  if (event.ctrlKey && event.code === 'KeyL') { event.preventDefault(); $('prompt').focus(); return; }
  if (target === $('prompt')) {
    if ((event.key === 'Enter' && !event.shiftKey && !event.isComposing && code !== 229) || code === 65376) { event.preventDefault(); safely(sendMessage)(); }
    return;
  }
  if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') return;
  if (target === $('conversation') && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
    event.preventDefault(); $('conversation').scrollBy(0, (event.key.endsWith('Up') ? -1 : 1) * $('conversation').clientHeight * .65); return;
  }
  if (event.key.startsWith('Arrow')) { event.preventDefault(); remoteMove(event.key.slice(5)); }
  if (event.key === 'Enter' && target?.tagName === 'BUTTON') { event.preventDefault(); target.click(); }
}, true);
window.addEventListener('online', () => {
  if (!ready) { if (!socket || socket.readyState === WebSocket.CLOSED) connect(); else socket.close(); }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { if (!socket || socket.readyState === WebSocket.CLOSED) connect(); else diagnostics(); }
});
setInterval(diagnostics, 15000);
connect();
