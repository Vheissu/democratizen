import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectApps } from '../suite/catalog.mjs';
const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const selected = selectApps(process.argv[2] || 'all');
const builds = JSON.parse(
  await fs.readFile(
    path.join(workspace, 'dist/frame-suite/builds.json'),
    'utf8',
  ),
);
const {
  FRAME_SUITE_TIZEN: tizen,
  FRAME_SUITE_SDB: sdb,
  FRAME_SUITE_SERIAL: serial,
  FRAME_SUITE_PROFILE: profile,
} = process.env;
if (![tizen, sdb, serial, profile].every(Boolean))
  throw new Error(
    'Run npm run suite:deploy, which configures the Tizen SDK and signing profile.',
  );
function run(command, args, timeout = 120000) {
  const result = spawnSync(command, args, {
    cwd: workspace,
    encoding: 'utf8',
    timeout,
    maxBuffer: 10_000_000,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  if (
    result.error ||
    result.status !== 0 ||
    /(?:install failed|failed to install|failed to launch|error :)/i.test(
      output,
    )
  )
    throw new Error(
      `${path.basename(command)} ${args[0]} failed: ${result.error?.message || output.trim().slice(-2500)}`,
    );
  return output;
}
run(sdb, ['connect', serial], 15000);
if (
  !run(sdb, ['devices'], 15000)
    .split('\n')
    .some(
      (line) =>
        line.trim().split(/\s+/)[0] === serial &&
        line.trim().split(/\s+/)[1] === 'device',
    )
)
  throw new Error(`TV is not connected: ${serial}`);
const results = [];
for (const app of selected) {
  const folder = path.join(workspace, 'dist/frame-suite', app.id);
  try {
    run(tizen, ['build-web', '--', folder]);
    run(tizen, [
      'package',
      '-t',
      'wgt',
      '-s',
      profile,
      '--',
      path.join(folder, '.buildResult'),
    ]);
    const output = run(tizen, [
      'install',
      '-s',
      serial,
      '-n',
      `${app.widget}.wgt`,
      '--',
      path.join(folder, '.buildResult'),
    ]);
    if (!/successfully installed|install completed/i.test(output))
      throw new Error(
        `Install did not confirm success: ${output.slice(-1500)}`,
      );
    const launch = run(tizen, ['run', '-s', serial, '-p', app.appId]);
    if (!/successfully launched/i.test(launch))
      throw new Error(`Launch did not confirm success: ${launch.slice(-1500)}`);
    results.push({
      id: app.id,
      appId: app.appId,
      buildId: builds.find((build) => build.id === app.id)?.buildId,
      installed: true,
      launched: true,
    });
    console.log(
      `${results.length}/${selected.length}: ${app.name} installed and launched.`,
    );
  } catch (error) {
    results.push({ id: app.id, error: error.message });
    console.error(`${app.name}: ${error.message}`);
  }
}
await fs.writeFile(
  path.join(workspace, 'dist/frame-suite/install-results.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2) +
    '\n',
);
const errors = results.filter((result) => result.error);
console.log(
  `${results.length - errors.length}/${selected.length} apps installed and launched; ${errors.length} errors.`,
);
if (errors.length) process.exitCode = 1;
else if (selected.some((app) => app.id === 'snake'))
  run(tizen, [
    'run',
    '-s',
    serial,
    '-p',
    selected.find((app) => app.id === 'snake').appId,
  ]);
