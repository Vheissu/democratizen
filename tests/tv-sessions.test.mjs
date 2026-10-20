import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { SessionManager } from '../server/sessions.mjs';

class RootBackend extends EventEmitter {
  constructor() { super(); this.input = []; this.sizes = []; this.stopped = false; }
  subscribe(event, fn) { this.on(event, fn); return { dispose: () => this.off(event, fn) }; }
  onData(fn) { return this.subscribe('data', fn); }
  onExit(fn) { return this.subscribe('exit', fn); }
  onState(fn) { return this.subscribe('state', fn); }
  write(data) { this.input.push(data); }
  resize(cols, rows) { this.sizes.push({ cols, rows }); }
  pause() {} resume() {}
  kill() { this.stopped = true; }
}
const snapshot = (manager, id) => new Promise(resolve => manager.snapshot(id, resolve));

test('TV root is disabled by default and arbitrary session targets are rejected', async t => {
  let called = false;
  const manager = new SessionManager({ tvFactory: () => { called = true; } });
  t.after(() => manager.dispose());
  assert.throws(() => manager.create({ kind: 'tv' }), /not enabled/);
  assert.throws(() => manager.create({ kind: 'ssh' }), /Unknown session target/);
  assert.equal(called, false); assert.equal(manager.list().length, 0);
});

test('Mac and TV sessions keep their target, screen and input separate when switching', async t => {
  const backend = new RootBackend();
  const manager = new SessionManager({ cwd: '/tmp', tvRoot: { enabled: true }, tvFactory: () => backend });
  t.after(async () => { backend.emit('exit', { exitCode: 0, cleanup: { confirmed: true } }); await manager.dispose(); });
  const mac = manager.create();
  const tv = manager.create({ kind: 'tv', cols: 90, rows: 25 });
  assert.equal(manager.list().find(s => s.id === tv.id).status, 'connecting');
  backend.emit('state', { status: 'running', identity: { uid: 0, euid: 0 } });
  backend.emit('data', 'TV_ONLY_SCREEN\r\n');
  assert.ok((await snapshot(manager, tv.id)).includes('TV_ONLY_SCREEN'));
  assert.ok(!(await snapshot(manager, mac.id)).includes('TV_ONLY_SCREEN'));
  manager.input(tv.id, 'id\r'); assert.deepEqual(backend.input, ['id\r']);
  manager.resize(tv.id, 120, 40); assert.deepEqual(backend.sizes.at(-1), { cols: 120, rows: 40 });
  const list = manager.list();
  assert.equal(list.find(s => s.id === mac.id).kind, 'mac');
  assert.equal(list.find(s => s.id === tv.id).kind, 'tv');
  assert.equal(list.find(s => s.id === tv.id).identity.uid, 0);
  assert.throws(() => manager.create({ kind: 'tv' }), /already open/);
});

test('closing root waits for verified cleanup and blocks further input', async () => {
  const backend = new RootBackend();
  const manager = new SessionManager({ tvRoot: { enabled: true }, tvFactory: () => backend });
  const tv = manager.create({ kind: 'tv' });
  const closing = manager.close(tv.id);
  assert.equal(backend.stopped, true);
  assert.equal(manager.list()[0].status, 'closing');
  assert.throws(() => manager.input(tv.id, 'id\r'), /closing/);
  backend.emit('exit', { exitCode: 0, cleanup: { confirmed: true, staging_cleaned: true, system_files_unchanged: true } });
  await closing; assert.equal(manager.list().length, 0);
  await manager.dispose();
});

test('failed root cleanup stays visible instead of disappearing as a successful close', async () => {
  const backend = new RootBackend();
  const manager = new SessionManager({ tvRoot: { enabled: true }, tvFactory: () => backend });
  const tv = manager.create({ kind: 'tv' });
  const closing = manager.close(tv.id);
  backend.emit('exit', { exitCode: 1, error: 'Cleanup could not be verified', cleanup: { confirmed: false } });
  await closing;
  assert.equal(manager.list().length, 1);
  assert.equal(manager.list()[0].status, 'error');
  assert.equal(manager.list()[0].cleanup.confirmed, false);
  assert.match(await snapshot(manager, tv.id), /cleanup not confirmed/);
  manager.close(tv.id); assert.equal(manager.list().length, 0);
  await manager.dispose();
});
