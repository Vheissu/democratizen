import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import nacl from 'tweetnacl';
import { base64 } from '../shared/crypto.mjs';

export const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = process.env.FRAME_TERMINAL_DATA_DIR || path.join(workspace, '.tools/frame-terminal');
export function lanAddress() {
  const candidates = Object.values(os.networkInterfaces()).flat().filter(x => x.family === 'IPv4' && !x.internal);
  return candidates.find(x => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address))?.address;
}
function writePrivate(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
export function setup() {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dataDir, 0o700);
  const hostFile = path.join(dataDir, 'host.json');
  const clientFile = path.join(dataDir, 'study-tv.json');
  if (fs.existsSync(hostFile) || fs.existsSync(clientFile)) {
    if (!fs.existsSync(hostFile) || !fs.existsSync(clientFile)) throw new Error('Pairing files are incomplete; restore both files before continuing');
    return readConfig();
  }
  const host = nacl.box.keyPair();
  const client = nacl.box.keyPair();
  const address = process.env.FRAME_HOST || lanAddress();
  if (!address) throw new Error('No LAN address found');
  const tvIP = process.env.TV_IP || process.env.STUDY_TV_IP;
  if (!tvIP) throw new Error('Set TV_IP to your TV LAN IPv4 address, then run npm run setup. See docs/frame-terminal.md.');
  if (isIP(address) !== 4 || isIP(tvIP) !== 4 || address === '0.0.0.0' || address.startsWith('127.')) throw new Error('FRAME_HOST and TV_IP must be LAN IPv4 addresses');
  const port = Number(process.env.FRAME_PORT || 4319);
  const previewPort = Number(process.env.FRAME_PREVIEW_PORT || 4320);
  if (![port, previewPort].every(p => Number.isInteger(p) && p >= 1024 && p <= 65535) || port === previewPort) throw new Error('Choose different FRAME_PORT and FRAME_PREVIEW_PORT values between 1024 and 65535');
  const shell = process.env.FRAME_SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  const cwd = path.resolve(process.env.FRAME_CWD || workspace);
  if (!fs.existsSync(shell) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('FRAME_SHELL and FRAME_CWD must exist');
  writePrivate(hostFile, { listenHost: address, port, previewPort, tvIP, allowedAddresses: [...new Set([tvIP, address, '127.0.0.1'])], hostSecretKey: base64(host.secretKey), hostPublicKey: base64(host.publicKey), allowedClients: [base64(client.publicKey)], cwd, shell });
  writePrivate(clientFile, { host: address, port, hostPublicKey: base64(host.publicKey), clientSecretKey: base64(client.secretKey) });
  return readConfig();
}
export function readConfig() {
  const host = JSON.parse(fs.readFileSync(path.join(dataDir, 'host.json'), 'utf8'));
  const rootFile = path.join(dataDir, 'tv-root.json');
  if (fs.existsSync(rootFile)) host.tvRoot = JSON.parse(fs.readFileSync(rootFile, 'utf8'));
  return { host, client: JSON.parse(fs.readFileSync(path.join(dataDir, 'study-tv.json'), 'utf8')) };
}
