import assert from 'node:assert/strict';
import { TvPty } from '../server/tv-pty.mjs';
import { readConfig } from './frame-config.mjs';

const { host } = readConfig();
if (!host.tvRoot?.enabled) throw new Error('Enable TV root support first. See docs/tv-shell.md.');
const terminal = new TvPty(host.tvRoot, { cols: 100, rows: 30 });
let output = '';
const waiting = new Set();
terminal.onData(data => {
  output += data;
  for (const item of waiting) if (output.includes(item.text)) { clearTimeout(item.timer); waiting.delete(item); item.resolve(); }
});
const expect = text => output.includes(text) ? Promise.resolve() : new Promise((resolve, reject) => {
  const item = { text, resolve, reject, timer: setTimeout(() => { waiting.delete(item); reject(new Error(`TV did not produce ${text}`)); }, 15000) };
  waiting.add(item);
});
const exit = new Promise(resolve => terminal.onExit(resolve));
terminal.onState(state => { if (state.status === 'error') for (const item of waiting) { clearTimeout(item.timer); waiting.delete(item); item.reject(new Error(state.error)); } });
try {
  await new Promise((resolve, reject) => terminal.onState(state => { if (state.status === 'running') resolve(); if (state.status === 'error') reject(new Error(state.error)); }));
  terminal.write("printf '\\nROOT_UID_%s\\n' \"$(id -u)\"; export FRAME_TV_STATE=retained; cd /tmp; printf '\\nSTATE_%s_%s\\n' \"$FRAME_TV_STATE\" \"$PWD\"\r");
  await expect('ROOT_UID_0'); await expect('STATE_retained_/tmp');
  terminal.resize(120, 40); terminal.write("printf '\\nSIZE_'; stty size\r"); await expect('SIZE_40 120');
  terminal.write('sleep 60\r'); await new Promise(resolve => setTimeout(resolve, 500)); output = ''; terminal.write('\x03');
  await expect('TV root # ');
  terminal.write("printf '\\nINTERRUPT_%s\\n' working\r"); await expect('INTERRUPT_working');
  terminal.kill(); const result = await exit;
  assert.equal(result.exitCode, 0); assert.equal(result.cleanup.confirmed, true);
  console.log('Verified TV UID 0, persistent shell state, PTY resize, Ctrl+C, close, staging cleanup and system-file hashes.');
} catch (error) { console.error(output.slice(-1600)); throw error; } finally {
  if (!terminal.finished) terminal.kill();
  await exit;
  for (const item of waiting) clearTimeout(item.timer);
}
