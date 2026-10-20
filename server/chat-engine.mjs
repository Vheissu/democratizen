import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

export class ChatEngine extends EventEmitter {
  constructor(config) { super(); this.config = config; this.pending = new Map(); this.sequence = 0; this.loaded = new Set(); this.closed = false; }
  async start() {
    const env = Object.fromEntries(['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'TMPDIR'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    env.CODEX_HOME = this.config.codexHome;
    this.process = spawn(this.config.binary, ['app-server', '--listen', 'stdio://', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false', '-c', 'features.multi_agent=false', '-c', 'features.apps=false', '-c', 'features.plugins=false', '-c', 'features.remote_plugin=false', '-c', 'features.skill_search=false', '-c', 'features.skip_host_skill_discovery=true', '-c', 'project_doc_max_bytes=0', '-c', 'web_search="disabled"'], { cwd: this.config.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process.stdout.setEncoding('utf8');
    this.process.stderr.resume();
    let buffer = '';
    this.process.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 16 * 1024 * 1024) { this.process.kill(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try { this.receive(JSON.parse(line)); } catch { this.emit('warning', 'The assistant returned an invalid response.'); }
      }
    });
    this.process.stdin.on('error', () => {});
    this.process.on('error', error => this.fail(new Error(`Could not start the Codex engine: ${error.code || 'unknown error'}`)));
    this.process.on('exit', () => { this.fail(new Error('The assistant service stopped. Reconnect to try again.')); this.emit('exit'); });
    await this.call('initialize', { clientInfo: { name: 'frame_chat', title: 'Frame Chat', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.write({ method: 'initialized' });
    return this;
  }
  receive(message) {
    const request = this.pending.get(message.id);
    if (request && !message.method) {
      this.pending.delete(message.id); clearTimeout(request.timer);
      message.error ? request.reject(new Error(message.error.message || 'Assistant request failed')) : request.resolve(message.result);
    } else if (message.id != null && message.method) {
      // This conversational client cannot execute tools or approve filesystem access.
      this.write({ id: message.id, error: { code: -32601, message: 'This TV chat client does not execute tools or grant permissions.' } });
    } else if (message.method) this.emit('notification', message.method, message.params || {});
  }
  write(message) {
    if (this.closed || !this.process || this.process.stdin.destroyed) throw new Error('Assistant service is unavailable.');
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }
  call(method, params = {}, timeout = 45000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Assistant request timed out (${method}).`)); }, timeout);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  fail(error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
  async account() {
    const { account } = await this.call('account/read', { refreshToken: false });
    return account ? { type: account.type, email: account.email || '', plan: account.planType || '' } : null;
  }
  async models() {
    const result = await this.call('model/list', { limit: 100, includeHidden: false });
    return result.data.filter(m => !m.hidden).map(m => ({ id: m.model, name: m.displayName || m.model, isDefault: m.isDefault, effort: m.defaultReasoningEffort, efforts: (m.supportedReasoningEfforts || []).map(e => e.reasoningEffort) }));
  }
  async prepare(chat) {
    if (!chat.threadId) {
      const response = await this.call('thread/start', {
        cwd: this.config.cwd, model: chat.model, sandbox: 'read-only', approvalPolicy: 'never', serviceName: 'frame_chat', ephemeral: this.config.ephemeral === true,
        baseInstructions: 'You are a helpful conversational assistant in Frame Chat, a personal TV client powered by Codex and the user’s ChatGPT subscription. Answer the user directly in clear, natural language. Use Markdown when useful. You can discuss and write code, but this client does not provide computer control, file access, or tool execution. Do not claim to perform actions you cannot perform.',
        config: { 'features.shell_tool': false, 'features.unified_exec': false, 'features.multi_agent': false, 'features.apps': false, 'features.skip_host_skill_discovery': true, 'project_doc_max_bytes': 0, 'web_search': 'disabled' }
      });
      chat.threadId = response.thread.id; this.loaded.add(chat.threadId);
    } else if (!this.loaded.has(chat.threadId)) {
      await this.call('thread/resume', { threadId: chat.threadId, excludeTurns: true, sandbox: 'read-only', approvalPolicy: 'never' });
      this.loaded.add(chat.threadId);
    }
  }
  async send(chat, text) {
    await this.prepare(chat);
    const result = await this.call('turn/start', { threadId: chat.threadId, model: chat.model, effort: chat.effort, input: [{ type: 'text', text }] });
    return result.turn.id;
  }
  async stop(chat) { if (chat.threadId && chat.turnId) await this.call('turn/interrupt', { threadId: chat.threadId, turnId: chat.turnId }); }
  close() { this.closed = true; this.fail(new Error('Assistant service is closing.')); this.process?.kill('SIGTERM'); }
}
