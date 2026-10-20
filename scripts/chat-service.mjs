import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chatSetup, chatData, workspace } from './chat-config.mjs';
if (process.platform !== 'darwin') throw new Error('Use npm run chat:start on other platforms.');
chatSetup();
const label = 'com.democratizen.framechat', domain = `gui/${process.getuid()}`;
const file = path.join(os.homedir(), 'Library/LaunchAgents', label + '.plist');
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const run = args => spawnSync('launchctl', args, { encoding: 'utf8' });
const command = process.argv[2] || 'status';
if (command === 'install') {
  run(['bootout', `${domain}/${label}`]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const name of ['host.log', 'host-error.log']) {
    const log = path.join(chatData, name);
    if (fs.existsSync(log) && fs.statSync(log).size > 2 * 1024 * 1024) fs.writeFileSync(log, '', { mode: 0o600 });
  }
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(path.join(workspace, 'server/chat-main.mjs'))}</string></array><key>WorkingDirectory</key><string>${xml(workspace)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH)}</string><key>FRAME_CHAT_DATA_DIR</key><string>${xml(chatData)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>15</integer><key>ExitTimeOut</key><integer>20</integer><key>StandardOutPath</key><string>${xml(path.join(chatData, 'host.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(chatData, 'host-error.log'))}</string></dict></plist>`;
  fs.writeFileSync(file, source, { mode: 0o600 });
  let result = run(['bootstrap', domain, file]);
  for (let attempt = 0; result.status && attempt < 3; attempt++) { await new Promise(r => setTimeout(r, 500)); result = run(['bootstrap', domain, file]); }
  if (result.status) throw new Error(result.stderr || result.stdout);
  console.log('Frame Chat host installed and started. It starts when you log in.');
} else if (command === 'stop') { const result = run(['bootout', `${domain}/${label}`]); if (result.status) throw new Error(result.stderr); console.log('Frame Chat host stopped.'); }
else { const result = run(['print', `${domain}/${label}`]); if (result.status) { console.log('Frame Chat host is not running.'); process.exitCode = 1; } else console.log(result.stdout.split('\n').filter(line => /state =|pid =|last exit code/.test(line)).join('\n')); }
