import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { chatSetup, workspace } from './chat-config.mjs';
const mode = process.env.FRAME_CHAT_MODE || 'standalone';
if (!['standalone', 'companion'].includes(mode)) throw new Error('FRAME_CHAT_MODE must be standalone or companion');
const client = mode === 'companion' ? { ...chatSetup().client, mode } : { mode };

const output = path.join(workspace, 'dist/frame-chat');
await fs.mkdir(output, { recursive: true, mode: 0o700 });
await build({ entryPoints: [path.join(workspace, 'chat-app/main.js')], bundle: true, outfile: path.join(output, 'bundle.js'), minify: true, target: 'chrome85', loader: { '.svg': 'text' } });
for (const name of ['icon.png']) await fs.copyFile(path.join(workspace, 'chat-app', name), path.join(output, name));
const html = (await fs.readFile(path.join(workspace, 'chat-app/index.html'), 'utf8')).replace('CSP_CONNECT', mode === 'standalone' ? 'https://auth.openai.com https://chatgpt.com' : `ws://${client.host}:${client.port}`);
await fs.writeFile(path.join(output, 'index.html'), html);
const buildId = createHash('sha256').update(await fs.readFile(path.join(output, 'bundle.js'))).update(await fs.readFile(path.join(output, 'bundle.css'))).digest('hex').slice(0, 12);
await fs.writeFile(path.join(output, 'connection.js'), `window.FRAME_CHAT_CONNECTION=${JSON.stringify({ ...client, buildId })};\n`, { mode: 0o600 });
let manifest = await fs.readFile(path.join(workspace, 'chat-app/config.xml'), 'utf8');
if (mode === 'companion') manifest = manifest.replace('<access origin="https://auth.openai.com" subdomains="false"/>', `<access origin="http://${client.host}:${client.port}" subdomains="false"/>`).replace('<access origin="https://chatgpt.com" subdomains="false"/>', '');
await fs.writeFile(path.join(output, 'config.xml'), manifest);
await fs.copyFile(path.join(workspace, 'LICENSE'), path.join(output, 'LICENSE'));
const licenses = path.join(output, 'licenses'); await fs.mkdir(licenses, { recursive: true });
for (const [dependency, name] of [['tweetnacl', 'LICENSE'], ['marked', 'LICENSE'], ['dompurify', 'LICENSE'], ['qrcode', 'license'], ['@tabler/icons', 'LICENSE']]) await fs.copyFile(path.join(workspace, 'node_modules', dependency, name), path.join(licenses, dependency.replaceAll('/', '-') + '.txt'));
let bytes = 0;
for (const name of await fs.readdir(output)) { const stat = await fs.stat(path.join(output, name)); if (stat.isFile()) bytes += stat.size; }
console.log(`Built Frame Chat ${buildId}: ${(bytes / 1024).toFixed(1)} KiB of app files; ${mode === 'standalone' ? 'runs directly on the TV' : `connected to ${client.host}:${client.port}`} `);
