import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'democratizen-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const run = extra => spawnSync(process.execPath, ['scripts/setup-frame-terminal.mjs'], {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: os.homedir(), FRAME_TERMINAL_DATA_DIR: directory, FRAME_HOST: '192.0.2.10', FRAME_SHELL: '/bin/zsh', ...extra }
  });
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  return { directory, run, read };
}
test('fresh setup requires an explicit TV address and never writes a partial pair for invalid input', t => {
  const { directory, run } = fixture(t);
  assert.notEqual(run({}).status, 0);
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.notEqual(run({ TV_IP: 'not-an-ip' }).status, 0);
  assert.notEqual(run({ TV_IP: '192.0.2.50', FRAME_PORT: '4320' }).status, 0);
  assert.deepEqual(fs.readdirSync(directory), []);
});
test('setup saves chosen endpoints privately and preserves the keypair on repeated runs', t => {
  const { directory, run, read } = fixture(t);
  assert.equal(run({ TV_IP: '192.0.2.50', FRAME_PORT: '5431' }).status, 0);
  const host = read('host.json'), client = read('study-tv.json');
  assert.equal(host.listenHost, '192.0.2.10'); assert.equal(client.port, 5431);
  assert.deepEqual(host.allowedAddresses, ['192.0.2.50', '192.0.2.10', '127.0.0.1']);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'host.json')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(directory, 'study-tv.json')).mode & 0o777, 0o600);
  assert.equal(run({ TV_IP: '192.0.2.99' }).status, 0);
  assert.deepEqual(read('host.json'), host); assert.deepEqual(read('study-tv.json'), client);
});
test('a missing half of a pair is reported and never silently regenerated', t => {
  const { directory, run, read } = fixture(t);
  assert.equal(run({ TV_IP: '192.0.2.50' }).status, 0);
  const host = read('host.json'); fs.unlinkSync(path.join(directory, 'study-tv.json'));
  const result = run({ TV_IP: '192.0.2.50' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Pairing files are incomplete/);
  assert.deepEqual(read('host.json'), host);
});
