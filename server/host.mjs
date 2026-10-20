import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import nacl from 'tweetnacl';
import { WebSocketServer, WebSocket } from 'ws';
import { base64, unbase64, authenticateHost } from '../shared/crypto.mjs';
import { SessionManager } from './sessions.mjs';

export function createHost(config, { previewDir, maxSessions = 8, tvFactory } = {}) {
  const sessions = new SessionManager({ cwd: config.cwd, shell: config.shell, tvRoot: config.tvRoot, tvFactory, maxSessions });
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(req.url === '/health' ? { service: 'Frame Terminal', ready: true } : { error: 'Not found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 131072, perMessageDeflate: false });
  const clients = new Set();
  const attempts = new Map();
  let disposed = false;
  server.on('upgrade', (req, socket, head) => {
    const address = req.socket.remoteAddress?.replace(/^::ffff:/, '');
    const now = Date.now();
    const recent = (attempts.get(address) || []).filter(t => now - t < 30000);
    recent.push(now);
    attempts.set(address, recent);
    if (req.url !== '/terminal' || !config.allowedAddresses.includes(address) || recent.length > 12 || clients.size >= 8 || disposed) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const send = (client, message) => {
    if (!client.cipher || client.ws.readyState !== WebSocket.OPEN) return;
    if (client.ws.bufferedAmount > 2097152) { client.ws.close(1013, 'Reconnect to restore the screen'); return; }
    try { client.ws.send(client.cipher.seal(message)); } catch { client.ws.close(1008, 'Transport error'); }
  };
  const sendList = () => { for (const c of clients) send(c, { type: 'sessions', sessions: sessions.list() }); };
  sessions.on('changed', sendList);
  sessions.on('data', (id, data) => {
    for (const c of clients) if (c.activeId === id) send(c, { type: 'data', id, data });
  });
  wss.on('connection', ws => {
    const client = { ws, cipher: null, activeId: null, attachVersion: 0, alive: true };
    clients.add(client);
    const challenge = base64(nacl.randomBytes(32));
    ws.send(JSON.stringify({ type: 'hello', challenge }));
    const authTimeout = setTimeout(() => ws.close(1008, 'Pairing required'), 5000);
    ws.on('pong', () => { client.alive = true; });
    ws.on('error', () => {});
    ws.on('message', (raw, binary) => {
      try {
        if (binary) throw new Error('Invalid packet');
        const text = raw.toString('utf8');
        if (!client.cipher) {
          client.cipher = authenticateHost(JSON.parse(text), challenge, unbase64(config.hostSecretKey, 32), config.allowedClients);
          clearTimeout(authTimeout);
          send(client, { type: 'ready', hostname: os.hostname().replace(/\.local$/, ''), capabilities: { tvRoot: !!config.tvRoot?.enabled }, sessions: sessions.list() });
          return;
        }
        const message = client.cipher.open(text);
        if (!message || typeof message.type !== 'string') throw new Error('Invalid message');
        try {
          switch (message.type) {
            case 'create': {
              const s = sessions.create({ cols: message.cols, rows: message.rows, kind: message.kind });
              send(client, { type: 'created', id: s.id });
              break;
            }
            case 'attach': {
              sessions.resize(message.id, message.cols, message.rows);
              const version = ++client.attachVersion;
              client.activeId = null;
              sessions.snapshot(message.id, screen => {
                if (client.attachVersion !== version || ws.readyState !== WebSocket.OPEN) return;
                client.activeId = message.id;
                send(client, { type: 'attached', id: message.id, screen });
              });
              break;
            }
            case 'resize':
              if (message.id !== client.activeId) throw new Error('Select a session first');
              sessions.resize(message.id, message.cols, message.rows);
              break;
            case 'input':
              if (message.id !== client.activeId) throw new Error('Select a session first');
              sessions.input(message.id, message.data);
              break;
            case 'rename': sessions.rename(message.id, message.name); break;
            case 'close': {
              for (const other of clients) if (other.activeId === message.id) { other.activeId = null; other.attachVersion++; }
              sessions.close(message.id);
              break;
            }
            case 'list': send(client, { type: 'sessions', sessions: sessions.list() }); break;
            default: throw new Error('Unknown command');
          }
        } catch (error) { send(client, { type: 'error', message: error.message }); }
      } catch { ws.close(1008, 'Invalid authentication or packet'); }
    });
    ws.on('close', () => { clearTimeout(authTimeout); client.attachVersion++; clients.delete(client); });
  });
  const heartbeat = setInterval(() => {
    attempts.clear();
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, 30000);
  heartbeat.unref();

  let preview;
  if (previewDir) {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
    preview = http.createServer((req, res) => {
      const port = preview.address().port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || (req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate')) { res.writeHead(403); res.end(); return; }
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
      const filename = path.resolve(previewDir, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!filename.startsWith(path.resolve(previewDir) + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': `default-src 'self'; connect-src ws://${config.listenHost}:${config.port}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
      fs.createReadStream(filename).pipe(res);
    });
  }
  return {
    sessions, server,
    async listen() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.listenHost, resolve); });
      if (preview) await new Promise((resolve, reject) => { preview.once('error', reject); preview.listen(config.previewPort, '127.0.0.1', resolve); });
      return server.address();
    },
    async close() {
      disposed = true;
      clearInterval(heartbeat);
      for (const c of clients) c.ws.terminate();
      await sessions.dispose();
      await Promise.all([new Promise(resolve => server.close(resolve)), preview ? new Promise(resolve => preview.close(resolve)) : Promise.resolve()]);
    }
  };
}
