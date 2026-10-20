import path from 'node:path';
import fs from 'node:fs';
import { chatSetup, chatData, workspace } from '../scripts/chat-config.mjs';
import { ChatEngine } from './chat-engine.mjs';
import { createChatHost } from './chat-host.mjs';

const { host: config } = chatSetup();
for (const name of ['host.log', 'host-error.log']) {
  const file = path.join(chatData, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) fs.truncateSync(file, 0);
}
if (!config.binary || !fs.existsSync(config.binary)) throw new Error('Codex engine not found. Install ChatGPT on the Mac or configure FRAME_CHAT_CODEX before setup.');
const engine = await new ChatEngine(config).start();
const host = createChatHost(config, engine, { dataDir: chatData, previewDir: path.join(workspace, 'dist/frame-chat') });
await host.listen();
console.log(`Frame Chat ready at ${config.listenHost}:${config.port}; preview http://127.0.0.1:${config.previewPort}`);
const diagnosticsTimer = setInterval(() => {
  fs.writeFileSync(path.join(chatData, 'device-status.json'), JSON.stringify([...host.diagnostics.entries()], null, 2), { mode: 0o600 });
}, 10000); diagnosticsTimer.unref();
let closing = false;
async function shutdown() { if (closing) return; closing = true; clearInterval(diagnosticsTimer); await host.close(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
engine.on('exit', () => {
  if (closing) return;
  console.error('Codex engine stopped; restarting the Frame Chat companion.');
  shutdown().finally(() => process.exit(1));
});
