import editIcon from '@tabler/icons/outline/edit.svg';
import searchIcon from '@tabler/icons/outline/search.svg';
import sidebarIcon from '@tabler/icons/outline/layout-sidebar.svg';
import settingsIcon from '@tabler/icons/outline/settings.svg';
import sendIcon from '@tabler/icons/outline/arrow-up.svg';
import stopIcon from '@tabler/icons/outline/square.svg';
import closeIcon from '@tabler/icons/outline/x.svg';
import archiveIcon from '@tabler/icons/outline/archive.svg';
import chevronDownIcon from '@tabler/icons/outline/chevron-down.svg';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import QRCode from 'qrcode';
import { authenticateClient, unbase64 } from '../shared/crypto.mjs';
import { DirectChatClient } from './direct-client.mjs';
import './style.css';

const $ = id => document.getElementById(id);
const icons = { edit: editIcon, search: searchIcon, sidebar: sidebarIcon, settings: settingsIcon, send: sendIcon, stop: stopIcon, close: closeIcon, archive: archiveIcon };
for (const el of document.querySelectorAll('[data-icon]')) { el.innerHTML = icons[el.dataset.icon]; el.setAttribute('aria-hidden', 'true'); }
document.documentElement.dataset.theme = localStorage.getItem('frame-chat-theme') || 'dark';
$('app').classList.toggle('sidebar-hidden', localStorage.getItem('frame-chat-sidebar') === 'hidden');
let modalReturnFocus, editingControl = null;

const connection = window.FRAME_CHAT_CONNECTION || { mode: 'standalone' };
const standalone = connection.mode === 'standalone';
let direct;
let preferredModel = localStorage.getItem('frame-chat-preferred-model');
let preferredEffort = localStorage.getItem('frame-chat-preferred-effort');
let choosingModel = false;
const requests = new Map();
let socket, cipher, retryTimer, toastTimer, ready = false, sequence = 0, retryDelay = 1000;
let chats = [], models = [], account = null, active = null, selectedId = localStorage.getItem('frame-chat-id');
let modalKind = '', textSize = Number(localStorage.getItem('frame-chat-text-size')) || 28;
let userScrolled = false, renderFrame = null, submitting = false;

function isTextControl(el) { return el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && ['text', 'search', 'email', 'url'].includes(el.type)); }
function endEditing() {
  if (isTextControl(editingControl)) editingControl.readOnly = true;
  editingControl = null;
}
function navigationFocus(el) {
  endEditing();
  if (isTextControl(el)) el.readOnly = true;
  el?.focus();
}
function editControl(el) {
  endEditing();
  if (isTextControl(el)) {
    // Focusing a read-only field highlights it without opening the TV keyboard.
    // Refocus only after OK/click, so Tizen starts its editor at that point.
    if (document.activeElement === el) el.blur();
    el.readOnly = false;
  }
  editingControl = el;
  el.focus();
}
for (const el of document.querySelectorAll('input,textarea')) if (isTextControl(el)) el.readOnly = true;
document.addEventListener('focusin', event => {
  if (event.target !== editingControl) {
    endEditing();
    if (isTextControl(event.target)) event.target.readOnly = true;
  }
});
document.addEventListener('click', event => {
  if (isTextControl(event.target) && editingControl !== event.target) editControl(event.target);
  else if (event.target.tagName === 'SELECT') editingControl = event.target;
});
document.addEventListener('change', event => { if (event.target.tagName === 'SELECT') endEditing(); });

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
  if (standalone) return direct ? direct.request(type, payload) : Promise.reject(new Error('Chat storage is unavailable.'));
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
  const previousAccount = account?.owner || account?.email || account?.id;
  account = data.account; models = data.models; chats = data.chats;
  if (previousAccount && previousAccount !== (account?.owner || account?.email || account?.id)) { active = null; selectedId = null; localStorage.removeItem('frame-chat-id'); renderMessages(); }
  $('welcome-hint').hidden = !!account;
  $('account-label').textContent = account ? `ChatGPT ${account.plan ? account.plan.charAt(0).toUpperCase() + account.plan.slice(1) : 'account'}` : 'Sign in to start chatting';
  $('plan-label').textContent = account ? 'Subscription connected' : 'Use your ChatGPT subscription';
  $('account-button').textContent = account ? 'Account' : 'Sign in with ChatGPT';
  fillModels(); renderSidebar(); controls();
}
function pickerLabel(button, text) {
  const label = document.createElement('span'); label.className = 'picker-label'; label.textContent = text;
  const caret = document.createElement('span'); caret.className = 'picker-caret'; caret.setAttribute('aria-hidden', 'true'); caret.innerHTML = chevronDownIcon;
  button.replaceChildren(label, caret);
}
function fillModels() {
  const selected = active?.model || preferredModel || $('model').value || models.find(m => m.isDefault)?.id || models[0]?.id || '';
  const model = models.find(m => m.id === selected);
  // Keep the user's choice even if a refreshed catalogue omits it. Sending is
  // disabled until they explicitly pick an available model; never substitute.
  $('model').value = selected;
  pickerLabel($('model'), model?.name || (selected ? `${selected} (unavailable)` : 'Frame Chat'));
  $('model').parentElement.hidden = !models.length && !selected;
  fillEfforts();
}
function fillEfforts() {
  const model = models.find(m => m.id === $('model').value);
  const chosen = active && active.model === model?.id ? active.effort : preferredModel === model?.id ? preferredEffort : null;
  const effort = model?.efforts.includes(chosen) ? chosen : model?.effort || '';
  $('effort').value = effort;
  pickerLabel($('effort'), effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : '');
  $('effort').parentElement.hidden = !model?.efforts.length;
}
async function chooseModel(modelId, effort) {
  if (choosingModel) return;
  const model = models.find(m => m.id === modelId);
  if (!model) throw new Error('That model is unavailable. Refresh the list and choose another.');
  const selectedEffort = model.efforts.includes(effort) ? effort : model.effort;
  const chatId = active?.id;
  choosingModel = true; controls();
  try {
    if (chatId) {
      const updated = await request('chat.model', { chatId, model: modelId, effort: selectedEffort });
      if (active?.id === chatId) active = updated;
    }
    preferredModel = modelId; preferredEffort = selectedEffort;
    localStorage.setItem('frame-chat-preferred-model', modelId);
    localStorage.setItem('frame-chat-preferred-effort', selectedEffort);
    fillModels(); closeModal();
  } finally { choosingModel = false; controls(); }
}
function picker(title, choices, selected, choose) {
  modal(title, 'picker');
  const list = document.createElement('div'); list.className = 'picker-options';
  for (const item of choices) {
    const button = document.createElement('button');
    button.textContent = item.name; button.dataset.nav = ''; button.dataset.choice = item.id;
    button.setAttribute('aria-pressed', String(item.id === selected));
    button.onclick = safely(() => choose(item.id)); list.append(button);
  }
  $('modal-body').append(list);
  // Focus is navigation only. Returning/closing the dialog leaves selection intact.
  navigationFocus([...list.children].find(button => button.dataset.choice === selected) || list.firstElementChild);
}
function renderSidebar() {
  const focusedId = document.activeElement?.dataset.chatId;
  $('chats').replaceChildren();
  const search = $('chat-search').value.trim().toLowerCase();
  for (const chat of chats.filter(chat => chat.title.toLowerCase().includes(search))) {
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
  $('send').disabled = !ready || !account || submitting || choosingModel || !models.some(model => model.id === $('model').value);
  $('new-chat').disabled = !ready;
  $('model').disabled = !ready || !account || !models.length || !!busy || choosingModel; $('effort').disabled = $('model').disabled;
  $('rename').disabled = !ready || !active; $('remove').disabled = !ready || !active || !!busy;
  $('prompt').placeholder = account ? 'Ask anything' : 'Sign in with ChatGPT to start';
  $('reply-status').textContent = active?.error || (busy ? 'Thinking…' : active?.status === 'interrupted' ? 'Reply stopped. You can continue the conversation.' : '');
}
function renderMessages() {
  $('welcome').hidden = !!active?.messages.length;
  $('app').classList.toggle('empty', !active?.messages.length);
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
  fillModels(); renderSidebar(); renderMessages(); navigationFocus($('prompt'));
}
function newChat() {
  active = null; selectedId = null; localStorage.removeItem('frame-chat-id'); userScrolled = false;
  fillModels(); renderSidebar(); renderMessages(); $('prompt').value = ''; editControl($('prompt'));
}
async function sendMessage(event) {
  event?.preventDefault();
  if (active?.status === 'thinking' || submitting || choosingModel) return;
  if (account && !models.some(model => model.id === $('model').value)) { toast('Choose an available model before sending.'); return; }
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
function closeModal() { $('modal').hidden = true; modalKind = ''; navigationFocus(modalReturnFocus?.isConnected && !modalReturnFocus.disabled ? modalReturnFocus : $('prompt')); }
function modal(title, kind = '') {
  if ($('modal').hidden) modalReturnFocus = document.activeElement;
  modalKind = kind; $('modal-title').textContent = title; $('modal-body').replaceChildren(); $('modal-actions').replaceChildren(); $('modal').hidden = false;
  navigationFocus($('modal-close'));
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
    ready = true; retryDelay = 1000; $('connection-label').textContent = standalone ? 'Runs on this TV' : 'Mac connected'; $('connection-dot').className = 'online';
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
  if (standalone) return;
  if (ready) request('diagnostics', { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, appVersion: '0.1.0', buildId: connection.buildId, renderedMessages: $('messages').children.length }).catch(() => {});
}
function connect() {
  if (standalone) return;
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
$('chat-search').oninput = renderSidebar;
function sidebar(hidden) { $('app').classList.toggle('sidebar-hidden', hidden); localStorage.setItem('frame-chat-sidebar', hidden ? 'hidden' : 'visible'); (hidden ? $('sidebar-open') : $('sidebar-close')).focus(); }
$('sidebar-close').onclick = () => sidebar(true);
$('sidebar-open').onclick = () => sidebar(false);
$('prompt').oninput = () => { $('prompt').style.height = 'auto'; $('prompt').style.height = `${Math.min($('prompt').scrollHeight, 200 * innerWidth / 1920)}px`; };
async function archivedChats() {
  modal('Archived chats');
  const archived = await request('chat.archived');
  if (!archived.length) paragraph('No archived chats.');
  for (const chat of archived) {
    const row = document.createElement('div'); row.className = 'archive-row';
    const title = document.createElement('span'); title.textContent = chat.title;
    const restore = document.createElement('button'); restore.textContent = 'Restore'; restore.dataset.nav = '';
    restore.onclick = safely(async () => { await request('chat.restore', { chatId: chat.id }); await archivedChats(); });
    const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.dataset.nav = '';
    remove.onclick = () => { modal('Delete this chat permanently?'); paragraph(`“${chat.title}” will be removed from this TV. This cannot be undone. Export your chats first if you want to keep a copy.`); action('Delete permanently', async () => { await request('chat.delete', { chatId: chat.id }); if (selectedId === chat.id) newChat(); await archivedChats(); }); action('Keep chat', archivedChats); };
    row.append(title, restore, remove); $('modal-body').append(row);
  }
  action('Done', closeModal);
}
$('settings').onclick = () => {
  modal('Settings');
  const row = document.createElement('label'); row.className = 'settings-row'; row.textContent = 'Appearance';
  const theme = document.createElement('select'); theme.setAttribute('aria-label', 'Appearance'); theme.dataset.nav = '';
  for (const value of ['dark', 'light']) { const option = document.createElement('option'); option.value = value; option.textContent = value[0].toUpperCase() + value.slice(1); theme.append(option); }
  theme.value = document.documentElement.dataset.theme; theme.onchange = () => { document.documentElement.dataset.theme = theme.value; localStorage.setItem('frame-chat-theme', theme.value); }; row.append(theme); $('modal-body').append(row);
  paragraph(standalone ? 'Runs directly on this TV. Your chats and sign-in are stored here; your computer can be switched off.' : 'Connected to the Mac companion. Keep the Mac awake while chatting.');
  if (standalone && account) {
    action('Archived chats', archivedChats);
    action('Export chats', async () => {
      const json = await request('chat.export');
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'frame-chat-export.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast('Export requested. Downloads depend on the TV browser’s support.');
    });
    action('Refresh models', async () => { await request('models.refresh'); toast('Available models updated.'); });
  }
  action('Done', closeModal);
};
$('composer').onsubmit = safely(sendMessage);
$('stop').onclick = safely(() => request('chat.stop', { chatId: active.id }));
$('modal-close').onclick = closeModal;
$('account-button').onclick = safely(async () => {
  if (!account) return signIn();
  modal('Your ChatGPT account'); paragraph(`${account.email || 'Signed in'} · ${account.plan || 'ChatGPT'} plan`);
  paragraph(standalone ? 'Your login and chats are saved on this TV. They stay separate from ChatGPT’s web and desktop history.' : 'Your login and chats are saved on the companion Mac. They stay separate from ChatGPT’s web and desktop history.');
  action('Sign out of Frame Chat', async () => { await request('logout'); closeModal(); }); action('Done', closeModal);
});
$('rename').onclick = () => {
  if (!active) return;
  modal('Name this chat'); const input = document.createElement('input'); input.setAttribute('aria-label', 'Chat name'); input.value = active.title; input.maxLength = 100; input.dataset.nav = ''; $('modal-body').append(input);
  action('Save name', async () => { await request('chat.rename', { chatId: active.id, title: input.value }); closeModal(); }); editControl(input); input.select();
};
$('remove').onclick = () => {
  if (!active) return;
  modal('Archive this chat?'); paragraph(standalone ? 'It will leave the sidebar. You can restore it from Settings → Archived chats.' : 'It will leave the sidebar. A copy stays in the Mac’s private archive.');
  action('Archive chat', async () => { await request('chat.remove', { chatId: active.id }); closeModal(); newChat(); }); action('Keep chatting', closeModal);
};
$('help').onclick = () => {
  modal('Keyboard & remote');
  paragraph('Keyboard: Enter sends. Shift Enter adds a line. Ctrl N starts a new chat. Ctrl L focuses the message box. Escape closes a dialog.');
  paragraph('Remote: Arrow keys move between controls. Press OK or click a text field to start typing. Back leaves the editor so arrows navigate again. Focus the conversation and use Up or Down to scroll.');
  paragraph(standalone ? 'Frame Chat connects directly to OpenAI over the TV’s internet connection. Your Mac can be asleep or switched off. Closing the app stops an active reply and saves its partial text.' : 'The companion Mac must remain awake and connected.');
  action('Done', closeModal);
};
for (const [id, delta] of [['smaller', -2], ['larger', 2]]) $(id).onclick = () => { textSize = Math.max(20, Math.min(42, textSize + delta)); localStorage.setItem('frame-chat-text-size', textSize); units(); };
$('model').onclick = () => picker('Choose a model', models.map(model => ({ id: model.id, name: model.name })), $('model').value, modelId => chooseModel(modelId, models.find(model => model.id === modelId)?.effort));
$('effort').onclick = () => {
  const model = models.find(model => model.id === $('model').value);
  if (model) picker('Reasoning effort', model.efforts.map(effort => ({ id: effort, name: effort.charAt(0).toUpperCase() + effort.slice(1) })), $('effort').value, effort => chooseModel(model.id, effort));
};
for (const button of document.querySelectorAll('[data-prompt]')) button.onclick = () => { $('prompt').value = button.dataset.prompt; editControl($('prompt')); };
function remoteMove(direction) {
  const root = $('modal').hidden ? document : $('modal');
  const options = [...root.querySelectorAll('[data-nav]')].filter(el => !el.disabled && el.getClientRects().length);
  const current = document.activeElement;
  if (!options.includes(current)) { navigationFocus(options[0]); return; }
  const from = current.getBoundingClientRect(), x = from.x + from.width / 2, y = from.y + from.height / 2;
  const candidates = options.filter(el => el !== current).map(el => {
    const r = el.getBoundingClientRect(), dx = r.x + r.width / 2 - x, dy = r.y + r.height / 2 - y;
    const primary = direction === 'Left' ? -dx : direction === 'Right' ? dx : direction === 'Up' ? -dy : dy;
    return { el, primary, score: primary + Math.abs(direction === 'Left' || direction === 'Right' ? dy : dx) * 2 };
  }).filter(x => x.primary > 2).sort((a, b) => a.score - b.score);
  if (candidates[0]) navigationFocus(candidates[0].el);
}
document.addEventListener('keydown', event => {
  const code = event.keyCode, target = document.activeElement;
  if (event.key === 'Tab' && !$('modal').hidden) {
    const controls = [...$('modal').querySelectorAll('[data-nav]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && target === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && target === last) { event.preventDefault(); first?.focus(); }
  }
  if (code === 10009 || event.key === 'Escape' || code === 65385) {
    event.preventDefault();
    if (editingControl) { const editor = editingControl; editor.blur(); navigationFocus(editor); }
    else if (!$('modal').hidden) closeModal();
    else if (code === 10009) navigationFocus(target === $('prompt') ? $('new-chat') : $('prompt'));
    return;
  }
  if (event.ctrlKey && event.code === 'KeyN') { event.preventDefault(); newChat(); return; }
  if (event.ctrlKey && event.code === 'KeyL') { event.preventDefault(); editControl($('prompt')); return; }
  if (isTextControl(target)) {
    if (editingControl !== target) {
      if (event.key === 'Enter' || code === 65376) { event.preventDefault(); editControl(target); return; }
      const typing = (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) || ['Backspace', 'Delete'].includes(event.key) || ((event.ctrlKey || event.metaKey) && event.code === 'KeyV');
      if (typing) { editControl(target); return; }
      // Arrow keys still move between controls until the field is activated.
    } else {
      if (target === $('prompt') && ((event.key === 'Enter' && !event.shiftKey && !event.isComposing && code !== 229) || code === 65376)) { event.preventDefault(); safely(sendMessage)(); }
      else if (target !== $('prompt') && (event.key === 'Enter' || code === 65376)) { event.preventDefault(); target.blur(); navigationFocus(target); }
      return;
    }
  }
  if (target?.tagName === 'SELECT') {
    if (editingControl === target) return;
    if (event.key === 'Enter' || event.key === ' ') { editingControl = target; return; }
  }
  if (target === $('conversation') && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
    event.preventDefault(); $('conversation').scrollBy(0, (event.key.endsWith('Up') ? -1 : 1) * $('conversation').clientHeight * .65); return;
  }
  if (event.key.startsWith('Arrow')) { event.preventDefault(); remoteMove(event.key.slice(5)); }
  if (event.key === 'Enter' && target?.tagName === 'BUTTON') { event.preventDefault(); target.click(); }
}, true);
window.addEventListener('online', () => {
  if (standalone) { if (account) request('models.refresh').catch(error => toast(error.message)); return; }
  if (!ready) { if (!socket || socket.readyState === WebSocket.CLOSED) connect(); else socket.close(); }
});
document.addEventListener('visibilitychange', () => {
  if (standalone) return;
  if (!document.hidden) { if (!socket || socket.readyState === WebSocket.CLOSED) connect(); else diagnostics(); }
});
if (standalone) {
  try { direct = new DirectChatClient({ emit: receive }); direct.start().catch(error => toast(error.message)); } catch (error) { toast(error.message); }
  window.addEventListener('pagehide', () => direct?.close());
  window.addEventListener('beforeunload', () => direct?.close());
} else { setInterval(diagnostics, 15000); connect(); }
renderMessages();
