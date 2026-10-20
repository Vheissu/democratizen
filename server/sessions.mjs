import pty from 'node-pty';
import headless from '@xterm/headless';
import serialize from '@xterm/addon-serialize';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { TvPty } from './tv-pty.mjs';

const { Terminal } = headless;
const { SerializeAddon } = serialize;
export function dimensions(cols, rows) {
  if (!Number.isInteger(cols) || cols < 20 || cols > 400 || !Number.isInteger(rows) || rows < 5 || rows > 150) throw new Error('Invalid terminal size');
  return { cols, rows };
}

function shellEnvironment() {
  const env = {};
  for (const key of ['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'FrameTerminal', TERM_PROGRAM_VERSION: '0.2.0' };
}

export class SessionManager extends EventEmitter {
  constructor({ cwd = os.homedir(), shell = '/bin/zsh', maxSessions = 8, tvRoot, tvFactory = (config, size) => new TvPty(config, size) } = {}) {
    super();
    this.cwd = cwd;
    this.shell = shell;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
    this.nextName = 1;
    this.tvRoot = tvRoot;
    this.tvFactory = tvFactory;
  }
  list() {
    return Array.from(this.sessions.values(), s => ({ id: s.id, name: s.name, kind: s.kind, status: s.status, identity: s.identity, error: s.error, cleanup: s.cleanup, cols: s.term.cols, rows: s.term.rows, exited: s.exited, exitCode: s.exitCode, createdAt: s.createdAt }));
  }
  get(id) {
    const s = this.sessions.get(id);
    if (!s || s.closed) throw new Error('Session no longer exists');
    return s;
  }
  create({ cols = 100, rows = 30, kind = 'mac' } = {}) {
    dimensions(cols, rows);
    if (!['mac', 'tv'].includes(kind)) throw new Error('Unknown session target');
    if (kind === 'tv' && !this.tvRoot?.enabled) throw new Error('TV root sessions are not enabled on this host');
    if (kind === 'tv' && [...this.sessions.values()].some(s => s.kind === 'tv' && !s.exited)) throw new Error('A TV root session is already open');
    if (this.sessions.size >= this.maxSessions) throw new Error('Eight sessions are already open. Close one to create another.');
    const term = new Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true });
    const serializer = new SerializeAddon();
    term.loadAddon(serializer);
    let child;
    try { child = kind === 'tv' ? this.tvFactory(this.tvRoot, { cols, rows }) : pty.spawn(this.shell, ['-l'], { name: 'xterm-256color', cols, rows, cwd: this.cwd, env: shellEnvironment() }); }
    catch (error) { term.dispose(); throw error; }
    const s = { id: randomUUID(), name: kind === 'tv' ? 'TV root' : `Shell ${this.nextName++}`, kind, status: kind === 'tv' ? 'connecting' : 'running', child, term, serializer, createdAt: Date.now(), exited: false, exitCode: null, closed: false, pending: 0, paused: false };
    this.sessions.set(s.id, s);
    s.dataSubscription = child.onData(data => {
      if (s.closed) return;
      const length = Buffer.byteLength(data);
      s.pending += length;
      if (s.pending > 262144 && !s.paused) { child.pause(); s.paused = true; }
      term.write(data, () => {
        if (s.closed) return;
        this.emit('data', s.id, data);
        s.pending -= length;
        if (s.paused && s.pending < 65536) { child.resume(); s.paused = false; }
      });
    });
    if (kind === 'tv') s.stateSubscription = child.onState(state => { if (!s.closed) { Object.assign(s, state); this.emit('changed'); } });
    s.exitSubscription = child.onExit(({ exitCode, cleanup, error }) => {
      if (s.closed) return;
      s.exited = true;
      s.exitCode = exitCode;
      s.cleanup = cleanup;
      s.error = error;
      s.status = error ? 'error' : 'exited';
      if (s.closeRequested && cleanup?.confirmed) { this.remove(s); return; }
      const detail = kind === 'tv' ? (cleanup?.confirmed ? '; TV cleanup verified' : '; TV cleanup not confirmed') : '';
      const marker = `\r\n\x1b[90m[Shell exited with code ${exitCode}${detail}]\x1b[0m\r\n`;
      term.write(marker, () => { if (!s.closed) { this.emit('data', s.id, marker); this.emit('changed'); } });
    });
    this.emit('changed');
    return s;
  }
  rename(id, name) {
    if (typeof name !== 'string' || !name.trim() || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a session name between 1 and 40 characters');
    this.get(id).name = name.trim();
    this.emit('changed');
  }
  resize(id, cols, rows) {
    dimensions(cols, rows);
    const s = this.get(id);
    if (s.term.cols === cols && s.term.rows === rows) return;
    if (!s.exited) s.child.resize(cols, rows);
    s.term.resize(cols, rows);
  }
  input(id, text) {
    if (typeof text !== 'string' || text.length > 32768) throw new Error('Input is too large');
    const s = this.get(id);
    if (s.status === 'closing') throw new Error('This session is closing');
    if (!s.exited) s.child.write(text);
  }
  snapshot(id, callback) {
    const s = this.get(id);
    s.term.write('', () => { if (!s.closed) callback(s.serializer.serialize({ scrollback: 2000 })); });
  }
  close(id) {
    const s = this.get(id);
    if (s.kind === 'tv' && !s.exited) {
      if (s.closePromise) return s.closePromise;
      s.closeRequested = true; s.status = 'closing'; this.emit('changed');
      s.closePromise = new Promise(resolve => { const listener = s.child.onExit(() => { listener.dispose(); resolve(); }); });
      s.child.kill();
      return s.closePromise;
    }
    this.remove(s);
  }
  remove(s) {
    s.closed = true;
    s.dataSubscription.dispose();
    s.exitSubscription.dispose();
    s.stateSubscription?.dispose();
    if (!s.exited) s.child.kill();
    s.term.dispose();
    this.sessions.delete(s.id);
    this.emit('changed');
  }
  async dispose() { await Promise.all([...this.sessions.keys()].map(id => this.close(id))); }
}
