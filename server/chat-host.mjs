import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import nacl from 'tweetnacl';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticateHost, base64, unbase64 } from '../shared/crypto.mjs';
import { ChatStore } from './chat-store.mjs';

export function createChatHost(config, engine, { dataDir, previewDir } = {}) {
  const store = new ChatStore(dataDir, engine);
  const clients = new Set(), attempts = new Map();
  let login = null, models = [], closing = false, currentOwner = null;
  const diagnostics = new Map();
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(req.url === '/health' ? { service: 'Frame Chat', ready: !closing } : { error: 'Not found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 131072, perMessageDeflate: false });
  function send(client, value) {
    if (!client.cipher || client.ws.readyState !== WebSocket.OPEN) return;
    if (client.ws.bufferedAmount > 2097152) { client.ws.close(1013, 'Reconnect to restore your chat'); return; }
    try { client.ws.send(client.cipher.seal(value)); } catch { client.ws.close(1008, 'Transport error'); }
  }
  function broadcast(value) { for (const client of clients) send(client, value); }
  async function status() {
    const account = await engine.account();
    currentOwner = account?.email || null;
    models = await engine.models();
    return { account, models, chats: store.list(currentOwner), login, version: '0.1.0' };
  }
  store.on('chat', chat => broadcast({ type: 'chat', chat }));
  store.on('list', () => broadcast({ type: 'chats', chats: store.list(currentOwner) }));
  store.on('delta', data => broadcast({ type: 'delta', ...data }));
  engine.on('notification', (method, params) => {
    if (method === 'account/login/completed') {
      login = null; broadcast({ type: 'loginComplete', success: params.success, error: params.error || null });
    }
    if (method === 'account/updated' || method === 'account/login/completed') status().then(value => broadcast({ type: 'status', ...value })).catch(() => {});
  });
  async function command(message, client) {
    let owner;
    if (message.type.startsWith('chat.')) {
      const account = await engine.account();
      owner = account?.email;
      if (!owner) throw new Error('Sign in with ChatGPT first.');
      currentOwner = owner;
      if (message.type !== 'chat.create' && store.get(message.chatId).owner !== owner) throw new Error('This chat belongs to a different signed-in account.');
    }
    switch (message.type) {
      case 'status': return status();
      case 'chat.create': {
        const model = models.find(m => m.id === message.model) || models.find(m => m.isDefault) || models[0];
        if (!model) throw new Error('No models are available. Sign in and reconnect.');
        const effort = model.efforts.includes(message.effort) ? message.effort : model.effort;
        return store.create(model.id, effort, owner);
      }
      case 'chat.read': return store.public(store.get(message.chatId));
      case 'chat.send': return store.send(message.chatId, message.text, message.requestId);
      case 'chat.stop': await store.stop(message.chatId); return {};
      case 'chat.rename': store.rename(message.chatId, message.title); return {};
      case 'chat.remove': await store.remove(message.chatId); return {};
      case 'chat.model': {
        const chat = store.get(message.chatId);
        if (chat.status === 'thinking') throw new Error('Stop the current reply before changing models.');
        const model = models.find(m => m.id === message.model);
        if (!model) throw new Error('That model is unavailable.');
        chat.model = model.id; chat.effort = model.efforts.includes(message.effort) ? message.effort : model.effort; store.changed(chat); return store.public(chat);
      }
      case 'login.start':
        if (await engine.account()) throw new Error('Sign out before signing in to a different account.');
        if (login) return login;
        login = { pending: true };
        try {
          const result = await engine.call('account/login/start', { type: 'chatgptDeviceCode' });
          const url = new URL(result.verificationUrl);
          if (url.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Unexpected sign-in destination.');
          login = { loginId: result.loginId, verificationUrl: result.verificationUrl, userCode: result.userCode, expiresAt: Date.now() + 15 * 60 * 1000 };
          return login;
        } catch (error) { login = null; throw error; }
      case 'login.cancel':
        if (login?.loginId) await engine.call('account/login/cancel', { loginId: login.loginId });
        login = null; return {};
      case 'logout':
        if (store.chats.some(c => c.status === 'thinking')) throw new Error('Stop active replies before signing out.');
        await engine.call('account/logout'); login = null; return {};
      case 'diagnostics':
        diagnostics.set(client.address, { at: Date.now(), userAgent: String(message.userAgent || '').slice(0, 300), width: Number(message.width), height: Number(message.height), appVersion: String(message.appVersion || ''), buildId: String(message.buildId || '').slice(0, 40), renderedMessages: Number(message.renderedMessages || 0) });
        return {};
      default: throw new Error('Unknown request.');
    }
  }
  server.on('upgrade', (req, socket, head) => {
    const address = req.socket.remoteAddress?.replace(/^::ffff:/, '');
    const now = Date.now(), recent = (attempts.get(address) || []).filter(t => now - t < 30000);
    recent.push(now); attempts.set(address, recent);
    if (req.url !== '/chat' || !config.allowedAddresses.includes(address) || recent.length > 12 || clients.size >= 6 || closing) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, address));
  });
  wss.on('connection', (ws, address) => {
    const client = { ws, address, cipher: null, alive: true }; clients.add(client);
    const challenge = base64(nacl.randomBytes(32));
    ws.send(JSON.stringify({ type: 'hello', challenge }));
    const timeout = setTimeout(() => ws.close(1008, 'Pairing required'), 5000);
    ws.on('pong', () => { client.alive = true; });
    ws.on('error', () => {});
    ws.on('message', (raw, binary) => {
      try {
        if (binary) throw new Error('Invalid packet');
        if (!client.cipher) {
          client.cipher = authenticateHost(JSON.parse(raw.toString()), challenge, unbase64(config.hostSecretKey, 32), config.allowedClients);
          clearTimeout(timeout);
          status().then(value => send(client, { type: 'ready', ...value })).catch(error => send(client, { type: 'fatal', message: error.message }));
          return;
        }
        const message = client.cipher.open(raw.toString());
        if (typeof message.id !== 'string' || message.id.length > 100 || typeof message.type !== 'string') throw new Error('Invalid request');
        Promise.resolve().then(() => command(message, client)).then(result => send(client, { type: 'result', id: message.id, result })).catch(error => send(client, { type: 'error', id: message.id, message: error.message.slice(0, 600) }));
      } catch { ws.close(1008, 'Invalid authentication or packet'); }
    });
    ws.on('close', () => { clearTimeout(timeout); clients.delete(client); });
  });
  const heartbeat = setInterval(() => {
    attempts.clear();
    for (const c of clients) { if (!c.alive) c.ws.terminate(); else { c.alive = false; c.ws.ping(); } }
  }, 30000); heartbeat.unref();
  const preview = previewDir ? http.createServer((req, res) => {
    const port = preview.address().port;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || (req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate')) { res.writeHead(403); res.end(); return; }
    let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
    const file = path.resolve(previewDir, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(path.resolve(previewDir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': `default-src 'self'; connect-src ws://${config.listenHost}:${config.port}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
    fs.createReadStream(file).pipe(res);
  }) : null;
  return {
    store, diagnostics, server, preview,
    async listen() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.listenHost, resolve); });
      if (preview) await new Promise((resolve, reject) => { preview.once('error', reject); preview.listen(config.previewPort, '127.0.0.1', resolve); });
      return server.address();
    },
    async close() {
      closing = true; clearInterval(heartbeat); store.close();
      for (const c of clients) c.ws.terminate();
      engine.close();
      await Promise.all([new Promise(r => server.close(r)), preview ? new Promise(r => preview.close(r)) : Promise.resolve()]);
    }
  };
}
