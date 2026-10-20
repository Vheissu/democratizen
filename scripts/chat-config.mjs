import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import nacl from 'tweetnacl';
import { workspace, lanAddress } from './frame-config.mjs';
import { base64 } from '../shared/crypto.mjs';

export { workspace };
export const chatData = path.resolve(process.env.FRAME_CHAT_DATA_DIR || path.join(workspace, '.tools/frame-chat'));
export function findCodex() {
  const candidates = [
    process.env.FRAME_CHAT_CODEX,
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    ...((process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, 'codex')))
  ].filter(Boolean);
  return candidates.find(file => { try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; } });
}
export function chatSetup() {
  fs.mkdirSync(chatData, { recursive: true, mode: 0o700 });
  fs.chmodSync(chatData, 0o700);
  const hostFile = path.join(chatData, 'host.json');
  const clientFile = path.join(chatData, 'client.json');
  if (fs.existsSync(hostFile) !== fs.existsSync(clientFile)) throw new Error('Frame Chat pairing is incomplete. Restore both private configuration files.');
  if (!fs.existsSync(hostFile)) {
    let terminal = {};
    try { terminal = JSON.parse(fs.readFileSync(path.join(workspace, '.tools/frame-terminal/host.json'))); } catch {}
    const address = process.env.FRAME_HOST || terminal.listenHost || lanAddress();
    const tvIP = process.env.TV_IP || terminal.tvIP;
    if (isIP(address || '') !== 4 || isIP(tvIP || '') !== 4 || address === '0.0.0.0') throw new Error('Set FRAME_HOST and TV_IP to the Mac and TV LAN IPv4 addresses.');
    const port = Number(process.env.FRAME_CHAT_PORT || 4321);
    const previewPort = Number(process.env.FRAME_CHAT_PREVIEW_PORT || 4322);
    if (![port, previewPort].every(n => Number.isInteger(n) && n >= 1024 && n <= 65535) || port === previewPort) throw new Error('Choose two different valid ports.');
    const host = nacl.box.keyPair(), client = nacl.box.keyPair();
    const config = { listenHost: address, tvIP, port, previewPort, binary: findCodex() || '', codexHome: path.join(chatData, 'codex'), cwd: path.join(chatData, 'workspace'), allowedAddresses: [...new Set([address, tvIP, '127.0.0.1'])], hostSecretKey: base64(host.secretKey), allowedClients: [base64(client.publicKey)] };
    const connection = { host: address, port, hostPublicKey: base64(host.publicKey), clientSecretKey: base64(client.secretKey) };
    fs.writeFileSync(hostFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    fs.writeFileSync(clientFile, JSON.stringify(connection, null, 2) + '\n', { mode: 0o600 });
  }
  const host = JSON.parse(fs.readFileSync(hostFile));
  const client = JSON.parse(fs.readFileSync(clientFile));
  for (const dir of [host.codexHome, host.cwd]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Keep this client's login and settings separate from the desktop application.
  const configFile = path.join(host.codexHome, 'config.toml');
  if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, 'cli_auth_credentials_store = "file"\nproject_doc_max_bytes = 0\nweb_search = "disabled"\n[analytics]\nenabled = false\n[features]\nshell_tool = false\nunified_exec = false\nmulti_agent = false\napps = false\nskip_host_skill_discovery = true\n', { mode: 0o600 });
  return { host, client };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { host } = chatSetup();
  console.log(`Frame Chat paired with ${host.tvIP}; Mac host ${host.listenHost}:${host.port}`);
  console.log(`Codex engine: ${host.binary || 'not found; set FRAME_CHAT_CODEX'}`);
  console.log(`Private chat data: ${chatData}`);
}
