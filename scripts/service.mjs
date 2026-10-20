import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { setup, dataDir, workspace } from './frame-config.mjs';

const label = 'com.rangefront.frame-terminal';
const file = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);
const domain = `gui/${process.getuid()}`;
const command = process.argv[2] || 'status';
if (process.platform !== 'darwin') throw new Error('This service helper uses macOS launchd. Use npm start on other hosts.');
const run = args => spawnSync('/bin/launchctl', args, { encoding: 'utf8' });
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
if (command === 'install') {
  setup();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  run(['bootout', `${domain}/${label}`]);
  const args = [process.execPath, path.join(workspace, 'server/main.mjs')];
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(workspace)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH)}</string><key>FRAME_TERMINAL_DATA_DIR</key><string>${xml(dataDir)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer><key>ExitTimeOut</key><integer>100</integer><key>StandardOutPath</key><string>${xml(path.join(dataDir, 'host.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(dataDir, 'host-error.log'))}</string></dict></plist>\n`;
  fs.writeFileSync(file, source, { mode: 0o600 });
  let result = run(['bootstrap', domain, file]);
  // launchd can briefly retain a job after bootout returns.
  for (let attempt = 0; result.status !== 0 && attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    result = run(['bootstrap', domain, file]);
  }
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  console.log('Frame Terminal host installed and started. It starts when you log in.');
} else if (command === 'stop') {
  const result = run(['bootout', `${domain}/${label}`]);
  if (result.status !== 0 && !result.stderr.includes('No such process')) throw new Error(result.stderr);
  console.log('Frame Terminal host stopped. Open shell sessions have ended.');
} else if (command === 'status') {
  const result = run(['print', `${domain}/${label}`]);
  console.log(result.status === 0 ? result.stdout.split('\n').filter(line => /state =|pid =|last exit code/.test(line)).join('\n') : 'Frame Terminal host is not running.');
} else throw new Error('Use install, stop, or status');
