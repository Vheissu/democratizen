import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export class ChatStore extends EventEmitter {
  constructor(directory, engine) {
    super(); this.engine = engine; this.file = path.join(directory, 'chats.json');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.chats = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
    if (!Array.isArray(this.chats)) throw new Error('Saved chats are invalid.');
    for (const chat of this.chats) if (chat.status === 'thinking') { chat.status = 'interrupted'; chat.error = 'The Mac host restarted before this reply finished.'; }
    engine.on('notification', (method, data) => this.notification(method, data));
    engine.on('exit', () => { if (this.closed) return; for (const chat of this.chats) if (chat.status === 'thinking') { chat.status = 'error'; chat.error = 'The assistant service stopped. Restart the Frame Chat host.'; this.changed(chat); } });
  }
  save() {
    clearTimeout(this.saveTimer);
    const data = JSON.stringify(this.chats);
    if (Buffer.byteLength(data) > 16 * 1024 * 1024) throw new Error('Saved chat storage is full. Remove older chats before continuing.');
    fs.writeFileSync(this.file + '.tmp', data, { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  public(chat) { const { threadId, turnId, stopRequested, owner, ...value } = chat; return value; }
  list(owner) { return this.chats.filter(c => owner === undefined || c.owner === owner).map(c => ({ id: c.id, title: c.title, model: c.model, updatedAt: c.updatedAt, status: c.status })).sort((a, b) => b.updatedAt - a.updatedAt); }
  get(id) { const chat = this.chats.find(c => c.id === id); if (!chat) throw new Error('Chat not found.'); return chat; }
  changed(chat) { this.save(); this.emit('chat', this.public(chat)); this.emit('list', this.list()); }
  create(model, effort, owner) {
    if (this.chats.length >= 50) throw new Error('There are 50 saved chats. Remove an older chat to start another.');
    const now = Date.now();
    const chat = { id: randomUUID(), owner, title: 'New chat', model, effort, messages: [], createdAt: now, updatedAt: now, status: 'idle', error: null };
    this.chats.push(chat); this.changed(chat); return this.public(chat);
  }
  rename(id, title) {
    if (typeof title !== 'string' || !title.trim() || title.length > 100) throw new Error('Use a chat name between 1 and 100 characters.');
    const chat = this.get(id); chat.title = title.trim(); this.changed(chat);
  }
  async remove(id) {
    const chat = this.get(id);
    if (chat.status === 'thinking') throw new Error('Stop the reply before removing this chat.');
    // Archive the engine history so removal from the TV is recoverable on the Mac.
    if (chat.threadId) await this.engine.call('thread/archive', { threadId: chat.threadId });
    const archive = path.join(path.dirname(this.file), 'archived');
    fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(archive, chat.id + '.json'), JSON.stringify(chat), { mode: 0o600 });
    this.chats = this.chats.filter(c => c.id !== id); this.save(); this.emit('list', this.list());
  }
  async send(id, text, requestId) {
    if (typeof text !== 'string' || !text.trim() || text.length > 16000) throw new Error('Enter a message of up to 16,000 characters.');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) throw new Error('Invalid message identifier.');
    const chat = this.get(id);
    if (chat.messages.some(m => m.requestId === requestId)) return this.public(chat);
    if (chat.status === 'thinking') throw new Error('Wait for this reply or press Stop.');
    if (this.chats.filter(c => c.status === 'thinking').length >= 2) throw new Error('Two replies are already running. Wait for one to finish.');
    if (Buffer.byteLength(JSON.stringify(this.chats)) > 14 * 1024 * 1024) throw new Error('Chat storage is nearly full. Archive older chats to continue.');
    if (Buffer.byteLength(JSON.stringify(chat)) > 1500000) throw new Error('This conversation is full. Start a new chat to continue.');
    if (chat.messages.length >= 200) throw new Error('This chat has reached 200 messages. Start a new chat to continue.');
    const account = await this.engine.account();
    if (!account?.email) throw new Error('Sign in with ChatGPT first.');
    if (account.email !== chat.owner) throw new Error('This chat belongs to a different signed-in account.');
    // Recheck after the asynchronous account request.
    if (chat.status === 'thinking') throw new Error('A reply is already in progress.');
    if (this.chats.filter(c => c.status === 'thinking').length >= 2) throw new Error('Two replies are already running. Wait for one to finish.');
    chat.messages.push({ id: randomUUID(), requestId, role: 'user', text: text.trim() });
    if (chat.title === 'New chat') chat.title = text.trim().slice(0, 65);
    chat.status = 'thinking'; chat.error = null; chat.updatedAt = Date.now(); chat.stopRequested = false;
    this.changed(chat);
    try {
      chat.turnId = await this.engine.send(chat, text.trim());
      this.save();
      if (chat.stopRequested) await this.engine.stop(chat);
    } catch (error) { chat.status = 'error'; chat.error = error.message; this.changed(chat); }
    return this.public(chat);
  }
  async stop(id) {
    const chat = this.get(id); chat.stopRequested = true;
    if (chat.turnId) await this.engine.stop(chat);
  }
  notification(method, data) {
    if (this.closed) return;
    const chat = this.chats.find(c => c.threadId && c.threadId === data.threadId);
    if (!chat) return;
    if (method === 'turn/started') { chat.turnId = data.turn.id; chat.status = 'thinking'; }
    if (method === 'item/agentMessage/delta') {
      let message = chat.messages.find(m => m.id === data.itemId);
      if (!message) { message = { id: data.itemId, role: 'assistant', text: '' }; chat.messages.push(message); }
      if (message.text.length + data.delta.length > 200000) { this.stop(chat.id).catch(() => {}); return; }
      message.text += data.delta;
      this.emit('delta', { chatId: chat.id, itemId: message.id, text: data.delta });
      clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(), 500); this.saveTimer.unref();
    }
    if (method === 'item/completed' && data.item?.type === 'agentMessage') {
      let message = chat.messages.find(m => m.id === data.item.id);
      if (!message) { message = { id: data.item.id, role: 'assistant', text: '' }; chat.messages.push(message); }
      message.text = String(data.item.text || '').slice(0, 200000); this.changed(chat);
    }
    if (method === 'turn/completed') {
      chat.status = data.turn.status === 'completed' ? 'idle' : data.turn.status === 'interrupted' ? 'interrupted' : 'error';
      chat.error = data.turn.error?.message || null; chat.turnId = null; chat.updatedAt = Date.now(); this.changed(chat);
    }
  }
  close() {
    this.closed = true;
    for (const chat of this.chats) if (chat.status === 'thinking') { chat.status = 'interrupted'; chat.error = 'The Mac host stopped before this reply finished.'; }
    this.save();
  }
}
