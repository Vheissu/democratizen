import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import fs from 'node:fs';

// node-pty-compatible lifecycle, backed by the root bridge's private stdio IPC.
export class TvPty extends EventEmitter {
  constructor(config, { cols, rows }) {
    super();
    this.config = config;
    this.size = { cols, rows };
    this.ready = false;
    this.finished = false;
    this.closing = false;
    this.cleanup = null;
    this.failure = null;
    this.decoder = new StringDecoder('utf8');
    queueMicrotask(() => this.start());
  }
  subscription(event, callback) { this.on(event, callback); return { dispose: () => this.off(event, callback) }; }
  onData(callback) { return this.subscription('data', callback); }
  onExit(callback) { return this.subscription('exit', callback); }
  onState(callback) { return this.subscription('state', callback); }
  start() {
    if (this.finished) return;
    this.process = spawn(this.config.python, [this.config.bridge], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'en_US.UTF-8', PYTHONUNBUFFERED: '1' } });
    let buffer = '', errors = '';
    this.process.stdout.setEncoding('utf8');
    this.process.stderr.setEncoding('utf8');
    this.process.stderr.on('data', data => { errors = (errors + data).slice(-3000); });
    this.process.stdout.on('data', data => {
      buffer += data;
      if (buffer.length > 262144) { this.fail('TV bridge output exceeded its frame limit'); this.kill(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try { this.receive(JSON.parse(line)); } catch { this.fail('Invalid TV bridge response'); this.kill(); }
      }
    });
    this.process.on('error', () => { this.fail('TV root helper could not start. Check the configured Python and root tooling.'); this.finish(1); });
    this.process.on('close', code => {
      clearTimeout(this.timeout); clearTimeout(this.closeTimeout);
      if (this.finished) return;
      if (!this.cleanup?.confirmed && !this.failure) this.fail('TV shell ended without confirmed cleanup' + (errors ? `: ${errors.slice(-500)}` : ''));
      this.finish(code === 0 && this.cleanup?.confirmed ? 0 : 1);
    });
    this.process.stdin.on('error', () => {});
    this.process.stdin.write(JSON.stringify({ ...this.config, ...this.size }) + '\n');
    this.timeout = setTimeout(() => { this.fail('TV root connection timed out'); this.kill(); }, 100000);
    this.timeout.unref();
    if (this.closing) this.kill();
  }
  receive(message) {
    switch (message.type) {
      case 'phase': if (message.staging) this.staging = message.staging; this.emit('data', `\x1b[90m${message.message}\x1b[0m\r\n`); break;
      case 'ready':
        if (message.uid !== 0 || message.euid !== 0) { this.fail('TV shell did not prove root identity'); this.kill(); return; }
        clearTimeout(this.timeout); this.ready = true;
        this.emit('state', { status: 'running', identity: { uid: 0, euid: 0, smack: message.smack } });
        this.resize(this.size.cols, this.size.rows);
        break;
      case 'data': this.emit('data', this.decoder.write(Buffer.from(message.data, 'base64'))); break;
      case 'shell-exit': this.shellExitCode = message.exitCode; this.ready = false; this.emit('state', { status: 'closing' }); break;
      case 'cleanup': this.cleanup = message; break;
      case 'error': this.fail(message.message); break;
      default: throw new Error('Invalid bridge message');
    }
  }
  fail(message) { this.ready = false; this.failure = message; this.emit('data', `\r\n\x1b[31m${message}\x1b[0m\r\n`); this.emit('state', { status: 'error', error: message }); }
  finish(code) {
    if (this.finished) return;
    this.finished = true; this.ready = false;
    clearTimeout(this.timeout); clearTimeout(this.closeTimeout); clearTimeout(this.hardKillTimer);
    this.cleanup ||= { staging: this.staging, confirmed: false, staging_cleaned: null, system_files_unchanged: null };
    if (this.config.statusFile) {
      try { fs.writeFileSync(this.config.statusFile, JSON.stringify({ at: new Date().toISOString(), cleanup: this.cleanup, error: this.failure }, null, 2) + '\n', { mode: 0o600 }); } catch {}
    }
    this.emit('data', this.decoder.end());
    this.emit('exit', { exitCode: this.failure ? 1 : (this.closing && code === 0 ? 0 : (this.shellExitCode ?? code)), cleanup: this.cleanup, error: this.failure });
  }
  command(value) {
    if (!this.process || this.process.stdin.destroyed) return;
    if (this.process.stdin.writableLength > 1048576) { this.fail('TV terminal input backlog exceeded its limit'); this.kill(); return; }
    this.process.stdin.write(JSON.stringify(value) + '\n');
  }
  write(data) { if (!this.ready) throw new Error('TV root shell is still connecting or closing'); this.command({ type: 'input', data: Buffer.from(data, 'utf8').toString('base64') }); }
  resize(cols, rows) { this.size = { cols, rows }; if (this.ready) this.command({ type: 'resize', cols, rows }); }
  pause() { this.process?.stdout.pause(); }
  resume() { this.process?.stdout.resume(); }
  kill() {
    this.closing = true; this.ready = false;
    this.command({ type: 'close' });
    if (!this.closeTimeout && this.process) {
      this.closeTimeout = setTimeout(() => {
        this.fail('TV cleanup timed out; reconnect to the TV before retrying'); this.process?.kill('SIGTERM');
        this.hardKillTimer = setTimeout(() => this.process?.kill('SIGKILL'), 15000); this.hardKillTimer.unref();
      }, 70000);
      this.closeTimeout.unref();
    }
  }
}
