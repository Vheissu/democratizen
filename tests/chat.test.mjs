import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter, once } from 'node:events';
import { get as httpGet } from 'node:http';
import nacl from 'tweetnacl';
import { WebSocket } from 'ws';
import { ChatStore } from '../server/chat-store.mjs';
import { createChatHost } from '../server/chat-host.mjs';
import { authenticateClient, base64 } from '../shared/crypto.mjs';

class Engine extends EventEmitter {
  identity = { type: 'chatgpt', email: 'test@example.com', plan: 'pro' };
  sent = 0;
  stopped = false;
  async account() { return this.identity; }
  async models() { return [{ id: 'test-model', name: 'Test', isDefault: true, effort: 'low', efforts: ['low'] }]; }
  async send(chat) { chat.threadId ||= 'thread-' + chat.id; this.sent++; return 'turn-1'; }
  async stop() { this.stopped = true; }
  async call(method) { if (method === 'account/logout') this.identity = null; return {}; }
  close() {}
}
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-chat-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
test('chat replies stream, finish, persist and deduplicate retried sends', async t => {
  const dir = temporary(t), engine = new Engine(), store = new ChatStore(dir, engine);
  const chat = store.create('test-model', 'low', 'test@example.com');
  await store.send(chat.id, 'Hello TV', 'request-0001');
  await store.send(chat.id, 'Hello TV', 'request-0001');
  assert.equal(engine.sent, 1);
  const threadId = store.get(chat.id).threadId;
  engine.emit('notification', 'item/agentMessage/delta', { threadId, itemId: 'reply', delta: 'Hello ' });
  engine.emit('notification', 'item/agentMessage/delta', { threadId, itemId: 'reply', delta: 'there.' });
  engine.emit('notification', 'item/completed', { threadId, item: { type: 'agentMessage', id: 'reply', text: 'Hello there.' } });
  engine.emit('notification', 'turn/completed', { threadId, turn: { status: 'completed' } });
  assert.equal(store.get(chat.id).status, 'idle');
  assert.equal(store.get(chat.id).messages.length, 2);
  const restored = new ChatStore(dir, new Engine());
  assert.equal(restored.get(chat.id).messages[1].text, 'Hello there.');
  assert.equal(fs.statSync(path.join(dir, 'chats.json')).mode & 0o777, 0o600);
});
test('failed and interrupted turns remain distinguishable from completed replies', async t => {
  const engine = new Engine(), store = new ChatStore(temporary(t), engine);
  const chat = store.create('test-model', 'low', 'test@example.com');
  await store.send(chat.id, 'Question', 'request-0002');
  await assert.rejects(store.send(chat.id, 'Another', 'request-0003'), /Wait/);
  engine.emit('notification', 'turn/completed', { threadId: store.get(chat.id).threadId, turn: { status: 'failed', error: { message: 'Rate limit reached' } } });
  assert.equal(store.get(chat.id).status, 'error');
  assert.equal(store.get(chat.id).error, 'Rate limit reached');
  await store.send(chat.id, 'Try again', 'request-0004');
  await store.stop(chat.id); assert.equal(engine.stopped, true);
  engine.emit('notification', 'turn/completed', { threadId: store.get(chat.id).threadId, turn: { status: 'interrupted' } });
  assert.equal(store.get(chat.id).status, 'interrupted');
});
test('archives remain recoverable and a restarted host marks unfinished replies interrupted', async t => {
  const dir = temporary(t), engine = new Engine(), store = new ChatStore(dir, engine);
  const chat = store.create('test-model', 'low', 'test@example.com');
  await store.send(chat.id, 'Question', 'request-0005');
  const restored = new ChatStore(dir, new Engine());
  assert.equal(restored.get(chat.id).status, 'interrupted');
  await restored.remove(chat.id);
  assert.equal(restored.list().length, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'archived', chat.id + '.json'))).messages[0].text, 'Question');
});
test('chat input and history limits reject oversized requests before inference', async t => {
  const engine = new Engine(), store = new ChatStore(temporary(t), engine);
  const chat = store.create('test-model', 'low', 'test@example.com');
  await assert.rejects(store.send(chat.id, 'x'.repeat(16001), 'request-0006'), /16,000/);
  store.get(chat.id).messages = Array.from({ length: 200 }, (_, i) => ({ id: String(i), role: 'user', text: 'hello' }));
  await assert.rejects(store.send(chat.id, 'more', 'request-0007'), /200 messages/);
  assert.equal(engine.sent, 0);
});
test('concurrent requests respect the two-reply limit after authentication', async t => {
  const engine = new Engine(), store = new ChatStore(temporary(t), engine);
  const chats = Array.from({ length: 3 }, () => store.create('test-model', 'low', 'test@example.com'));
  const results = await Promise.allSettled(chats.map((chat, i) => store.send(chat.id, 'Hello', `concurrent-${i}`)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.equal(engine.sent, 2);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /Two replies/);
});
async function fixture(t, withPreview = false) {
  const hostKey = nacl.box.keyPair(), clientKey = nacl.box.keyPair(), engine = new Engine();
  const config = { listenHost: '127.0.0.1', port: 0, previewPort: 0, allowedAddresses: ['127.0.0.1'], hostSecretKey: base64(hostKey.secretKey), allowedClients: [base64(clientKey.publicKey)] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-chat-host-'));
  let previewDir;
  if (withPreview) {
    previewDir = path.join(dir, 'app'); fs.mkdirSync(previewDir);
    fs.writeFileSync(path.join(previewDir, 'connection.js'), 'window.PRIVATE_PAIRING="fixture";');
  }
  const host = createChatHost(config, engine, { dataDir: dir, previewDir });
  const address = await host.listen(); t.after(async () => { await host.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { host, engine, hostKey, clientKey, url: `ws://127.0.0.1:${address.port}/chat`, http: `http://127.0.0.1:${address.port}` };
}
async function connect(f, key = f.clientKey) {
  const ws = new WebSocket(f.url); let cipher;
  const queue = [], waiters = [];
  const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve));
  ws.on('message', data => {
    const message = cipher ? cipher.open(data.toString()) : JSON.parse(data.toString());
    const waiter = waiters.shift(); waiter ? waiter(message) : queue.push(message);
  });
  await once(ws, 'open');
  const hello = await next(); const auth = authenticateClient(hello.challenge, key.secretKey, f.hostKey.publicKey); cipher = auth.cipher; ws.send(auth.packet);
  const call = async (type, payload = {}) => {
    const id = nacl.randomBytes(8).join('');
    ws.send(cipher.seal({ id, type, ...payload }));
    while (true) { const message = await next(); if (message.id === id) { if (message.type === 'error') throw new Error(message.message); return message.result; } }
  };
  return { ws, next, call, cipher };
}
test('paired clients create chats, restore history and cannot cross account boundaries', async t => {
  const f = await fixture(t), client = await connect(f);
  assert.equal((await client.next()).type, 'ready');
  const chat = await client.call('chat.create', { model: 'test-model', effort: 'low' });
  await client.call('chat.send', { chatId: chat.id, text: 'Private conversation', requestId: 'request-0010' });
  f.engine.emit('notification', 'turn/completed', { threadId: f.host.store.get(chat.id).threadId, turn: { status: 'completed' } });
  client.ws.close(); await once(client.ws, 'close');
  const reconnected = await connect(f); const ready = await reconnected.next();
  assert.equal(ready.chats[0].id, chat.id);
  assert.equal((await reconnected.call('chat.read', { chatId: chat.id })).messages[0].text, 'Private conversation');
  f.engine.identity = { type: 'chatgpt', email: 'other@example.com', plan: 'plus' };
  assert.equal((await reconnected.call('status')).chats.length, 0);
  await assert.rejects(reconnected.call('chat.read', { chatId: chat.id }), /different signed-in account/);
  reconnected.ws.close();
});
test('unpaired clients and replayed packets are rejected, and LAN HTTP never exposes credentials', async t => {
  const f = await fixture(t), stranger = await connect(f, nacl.box.keyPair());
  const [code] = await once(stranger.ws, 'close'); assert.equal(code, 1008);
  const client = await connect(f); await client.next();
  const packet = client.cipher.seal({ id: 'replayed', type: 'status' });
  client.ws.send(packet); await client.next();
  client.ws.send(packet); const [replayCode] = await once(client.ws, 'close'); assert.equal(replayCode, 1008);
  const response = await fetch(f.http + '/connection.js'); assert.equal(response.status, 404);
  assert.equal(f.engine.sent, 0);
});
test('the private preview rejects foreign origins and DNS-rebinding host headers', async t => {
  const f = await fixture(t, true);
  const url = `http://127.0.0.1:${f.host.preview.address().port}/connection.js`;
  const local = await fetch(url);
  assert.equal(local.status, 200);
  assert.equal(local.headers.get('cross-origin-resource-policy'), 'same-origin');
  await local.text();
  assert.equal((await fetch(url, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    httpGet(url, { headers: { Host: 'untrusted.example' }, agent: false }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await fetch(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});
