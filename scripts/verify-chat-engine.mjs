import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chatSetup } from './chat-config.mjs';
import { ChatEngine } from '../server/chat-engine.mjs';
import { ChatStore } from '../server/chat-store.mjs';

const { host } = chatSetup();
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-chat-verify-'));
const config = { ...host, ...(process.env.FRAME_CHAT_VERIFY_ACCOUNT_HOME ? { codexHome: path.resolve(process.env.FRAME_CHAT_VERIFY_ACCOUNT_HOME) } : {}), cwd: directory };
let engine, store, chat;
const timers = new Set();
function complete(chatId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { store.off('chat', listener); reject(new Error('Timed out waiting for the subscription response.')); }, 90000);
    timers.add(timer);
    const listener = value => {
      if (value.id !== chatId || value.status === 'thinking') return;
      clearTimeout(timer); timers.delete(timer); store.off('chat', listener);
      value.status === 'idle' ? resolve(value) : reject(new Error(value.error || value.status));
    };
    store.on('chat', listener);
  });
}
try {
  engine = await new ChatEngine(config).start();
  const account = await engine.account();
  if (!account?.email) throw new Error('Sign in to Frame Chat before running the live verification.');
  const models = await engine.models(), model = models.find(m => m.isDefault) || models[0];
  store = new ChatStore(directory, engine);
  chat = store.create(model.id, model.efforts.includes('low') ? 'low' : model.effort, account.email);
  let finished = complete(chat.id);
  await store.send(chat.id, 'Remember the word marmalade for this conversation. Reply only: remembered.', 'verify-message-0001');
  await finished;
  store.close(); engine.close();
  engine = await new ChatEngine(config).start();
  store = new ChatStore(directory, engine);
  finished = complete(chat.id);
  await store.send(chat.id, 'Which word did I ask you to remember? Reply with that word only.', 'verify-message-0002');
  const result = await finished;
  assert.match(result.messages.at(-1).text.toLowerCase(), /marmalade/);
  console.log(`Subscription inference and engine-restart recovery passed (${model.id}).`);
} finally {
  for (const timer of timers) clearTimeout(timer);
  if (engine && chat && store) {
    const record = store.get(chat.id);
    if (record.threadId) await engine.call('thread/archive', { threadId: record.threadId }).catch(() => {});
  }
  store?.close(); engine?.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
