import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import nacl from 'tweetnacl';
import { WebSocket } from 'ws';
import { createHost } from '../server/host.mjs';
import { authenticateClient, authenticateHost, base64 } from '../shared/crypto.mjs';

const hostKeys = nacl.box.keyPair(), clientKeys = nacl.box.keyPair();
async function fixture(t) {
  const host = createHost({ listenHost: '127.0.0.1', port: 0, allowedAddresses: ['127.0.0.1'], hostSecretKey: base64(hostKeys.secretKey), allowedClients: [base64(clientKeys.publicKey)], cwd: '/tmp', shell: '/bin/zsh' });
  await host.listen(); t.after(() => host.close());
  return { host, url: `ws://127.0.0.1:${host.server.address().port}/terminal` };
}
async function client(url) {
  const ws = new WebSocket(url);
  const queue = [], pending = [];
  let cipher;
  ws.on('error', () => {});
  ws.on('message', raw => {
    const value = cipher ? cipher.open(raw.toString()) : JSON.parse(raw.toString());
    const i = pending.findIndex(wait => wait.predicate(value));
    if (i < 0) queue.push(value); else { const [wait] = pending.splice(i, 1); clearTimeout(wait.timer); wait.resolve(value); }
  });
  function next(predicate = () => true) {
    const i = queue.findIndex(predicate);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const wait = { predicate, resolve, timer: setTimeout(() => { pending.splice(pending.indexOf(wait), 1); reject(new Error('Timed out waiting for terminal response')); }, 8000) };
      pending.push(wait);
    });
  }
  const hello = await next();
  return {
    ws, next, hello,
    async auth(keys = clientKeys) { const auth = authenticateClient(hello.challenge, keys.secretKey, hostKeys.publicKey); cipher = auth.cipher; ws.send(auth.packet); return next(x => x.type === 'ready'); },
    send(value) { const packet = cipher.seal(value); ws.send(packet); return packet; },
    async screen(id) { this.send({ type: 'attach', id, cols: 100, rows: 30 }); return (await next(x => x.type === 'attached' && x.id === id)).screen; },
    async close() { if (ws.readyState >= WebSocket.CLOSING) return; const closed = once(ws, 'close'); ws.close(); await closed; }
  };
}

test('real Mac shells stay separate, resize, reconnect with screen state, and close', async t => {
  const { host, url } = await fixture(t);
  let c = await client(url); t.after(() => c.close());
  await c.auth();
  c.send({ type: 'create', cols: 100, rows: 30 });
  const first = (await c.next(x => x.type === 'created')).id;
  await c.screen(first);
  c.send({ type: 'input', id: first, data: "export FRAME_SESSION=alpha; printf '\\nFIRST_READY\\n'\r" });
  await c.next(x => x.type === 'data' && x.data.includes('FIRST_READY'));
  c.send({ type: 'create', cols: 100, rows: 30 });
  const second = (await c.next(x => x.type === 'created')).id;
  await c.screen(second);
  c.send({ type: 'input', id: second, data: "printf '\\nISOLATED_%s\\n' \"${FRAME_SESSION:-yes}\"\r" });
  await c.next(x => x.type === 'data' && x.data.includes('ISOLATED_yes'));
  c.send({ type: 'resize', id: second, cols: 120, rows: 40 });
  c.send({ type: 'input', id: second, data: "printf '\\nSIZE_'; stty size\r" });
  await c.next(x => x.type === 'data' && x.data.includes('40 120'));
  c.send({ type: 'rename', id: first, name: 'Build tools' });
  await c.next(x => x.type === 'sessions' && x.sessions.some(s => s.name === 'Build tools'));
  await c.close();
  assert.equal(host.sessions.list().length, 2);
  c = await client(url);
  const ready = await c.auth(); assert.equal(ready.sessions.length, 2);
  const screen = await c.screen(first); assert.ok(screen.includes('FIRST_READY'));
  c.send({ type: 'input', id: first, data: "printf '\\nRESTORED_%s\\n' \"$FRAME_SESSION\"\r" });
  await c.next(x => x.type === 'data' && x.data.includes('RESTORED_alpha'));
  c.send({ type: 'input', id: second, data: 'this must not reach a different shell' });
  assert.match((await c.next(x => x.type === 'error')).message, /Select a session/);
  c.send({ type: 'input', id: first, data: 'exit 7\r' });
  await c.next(x => x.type === 'data' && x.data.includes('Shell exited with code 7'));
  c.send({ type: 'close', id: first });
  await c.next(x => x.type === 'sessions' && x.sessions.length === 1);
  c.send({ type: 'close', id: second });
  await c.next(x => x.type === 'sessions' && x.sessions.length === 0);
  assert.equal(host.sessions.list().length, 0);
});

test('unpaired clients cannot open shells', async t => {
  const { host, url } = await fixture(t);
  const c = await client(url); t.after(() => c.close());
  const auth = authenticateClient(c.hello.challenge, nacl.box.keyPair().secretKey, hostKeys.publicKey);
  const closed = once(c.ws, 'close'); c.ws.send(auth.packet);
  assert.equal((await closed)[0], 1008); assert.equal(host.sessions.list().length, 0);
});
test('plaintext commands before authentication are rejected', async t => {
  const { host, url } = await fixture(t);
  const c = await client(url); t.after(() => c.close());
  const closed = once(c.ws, 'close'); c.ws.send(JSON.stringify({ type: 'create', cols: 100, rows: 30 }));
  assert.equal((await closed)[0], 1008); assert.equal(host.sessions.list().length, 0);
});
test('replayed encrypted commands are rejected before a second shell is opened', async t => {
  const { host, url } = await fixture(t);
  const c = await client(url); t.after(() => c.close()); await c.auth();
  const packet = c.send({ type: 'create', cols: 100, rows: 30 });
  await c.next(x => x.type === 'created');
  const closed = once(c.ws, 'close'); c.ws.send(packet);
  assert.equal((await closed)[0], 1008); assert.equal(host.sessions.list().length, 1);
});
test('modified encrypted commands fail authentication', async t => {
  const { host, url } = await fixture(t);
  const c = await client(url); t.after(() => c.close()); await c.auth();
  const closed = once(c.ws, 'close');
  c.ws.send(JSON.stringify({ seq: 0, box: base64(nacl.randomBytes(80)) }));
  assert.equal((await closed)[0], 1008); assert.equal(host.sessions.list().length, 0);
});
test('old pairing challenges fail and large screen restores remain encrypted', () => {
  const auth = authenticateClient(base64(nacl.randomBytes(32)), clientKeys.secretKey, hostKeys.publicKey);
  assert.throws(() => authenticateHost(JSON.parse(auth.packet), 'different challenge', hostKeys.secretKey, [base64(clientKeys.publicKey)]), /Stale challenge/);
  const challenge = base64(nacl.randomBytes(32));
  const valid = authenticateClient(challenge, clientKeys.secretKey, hostKeys.publicKey);
  const hostCipher = authenticateHost(JSON.parse(valid.packet), challenge, hostKeys.secretKey, [base64(clientKeys.publicKey)]);
  const screen = 'private screen content\r\n'.repeat(20000);
  const packet = hostCipher.seal({ type: 'attached', screen });
  assert.ok(!packet.includes('private screen content'));
  assert.equal(valid.cipher.open(packet).screen, screen);
});
test('invalid sizes, names and session limits return errors without killing the connection', async t => {
  const { host, url } = await fixture(t);
  const c = await client(url); t.after(() => c.close()); await c.auth();
  c.send({ type: 'create', kind: 'tv', cols: 80, rows: 24 });
  assert.match((await c.next(x => x.type === 'error')).message, /not enabled/);
  c.send({ type: 'create', kind: 'arbitrary-target', cols: 80, rows: 24 });
  assert.match((await c.next(x => x.type === 'error')).message, /Unknown session target/);
  assert.equal(host.sessions.list().length, 0);
  c.send({ type: 'create', cols: -1, rows: 20 });
  assert.match((await c.next(x => x.type === 'error')).message, /Invalid terminal size/);
  for (let i = 0; i < 8; i++) { c.send({ type: 'create', cols: 80, rows: 24 }); await c.next(x => x.type === 'created'); }
  c.send({ type: 'create', cols: 80, rows: 24 });
  assert.match((await c.next(x => x.type === 'error')).message, /Eight sessions/);
  c.send({ type: 'rename', id: host.sessions.list()[0].id, name: '\x1b[2J' });
  assert.match((await c.next(x => x.type === 'error')).message, /session name/);
  assert.equal(host.sessions.list().length, 8);
});

test('the LAN HTTP server never serves widget files or pairing credentials', async t => {
  const { host } = await fixture(t);
  const origin = `http://127.0.0.1:${host.server.address().port}`;
  assert.equal((await fetch(`${origin}/health`)).status, 200);
  for (const route of ['/connection.js', '/host.json', '/index.html', '/terminal']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), '{"error":"Not found"}');
  }
});

test('connections from an address outside the allowlist cannot authenticate', async t => {
  const host = createHost({ listenHost: '127.0.0.1', port: 0, allowedAddresses: [], hostSecretKey: base64(hostKeys.secretKey), allowedClients: [base64(clientKeys.publicKey)] });
  await host.listen(); t.after(() => host.close());
  const ws = new WebSocket(`ws://127.0.0.1:${host.server.address().port}/terminal`);
  const rejected = await new Promise(resolve => { ws.on('error', resolve); });
  assert.match(rejected.message, /403/);
  assert.equal(host.sessions.list().length, 0);
});
