import path from 'node:path';
import { createHost } from './host.mjs';
import { setup, workspace } from '../scripts/frame-config.mjs';

const { host: config } = setup();
const host = createHost(config, { previewDir: path.join(workspace, 'dist/frame-terminal') });
try {
  await host.listen();
  console.log(`Frame Terminal ready at ${config.listenHost}:${config.port}; preview http://127.0.0.1:${config.previewPort}`);
} catch (error) { console.error(error.message); process.exit(1); }
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await host.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
