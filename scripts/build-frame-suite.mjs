import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { apps, selectApps } from '../suite/catalog.mjs';
import { widgetIcon } from './suite-icons.mjs';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const requested = process.argv[2] || 'all';
const selected = requested === 'preview' ? [] : selectApps(requested);
const output = path.join(workspace, 'dist/frame-suite');
await fs.mkdir(output, { recursive: true });

function manifest(app) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://democratizen.local/${app.id}" version="1.0.0" viewmodes="maximized">
  <tizen:application id="${app.appId}" package="${app.package}" required_version="6.0"/>
  <content src="index.html"/>
  <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
  <icon src="icon.png"/>
  <name>${app.widget}</name>
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
  <tizen:profile name="tv-samsung"/>
  <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
`;
}
const html = (name) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'"><title>${name}</title><link rel="stylesheet" href="bundle.css"><link rel="icon" href="icon.png"><script src="bundle.js" defer></script></head><body><div id="suite"></div></body></html>`;

async function buildApp(app) {
  const included = app ? [app] : apps;
  const folder = path.join(output, app?.id || 'preview');
  // Retain signed SDK artifacts until the next packaging pass.
  await fs.mkdir(folder, { recursive: true });
  const source = `import { boot } from './suite/shell.mjs';\n${included.map((item) => `import * as ${item.id} from './suite/apps/${item.id}.mjs';`).join('\n')}\nboot({${included.map((item) => item.id).join(',')}}, ${JSON.stringify(app?.id || null)});`;
  await build({
    stdin: {
      contents: source,
      resolveDir: workspace,
      sourcefile: 'suite-entry.mjs',
    },
    bundle: true,
    outfile: path.join(folder, 'bundle.js'),
    target: 'chrome85',
    minify: true,
    loader: { '.woff2': 'file' },
    assetNames: 'assets/[name]-[hash]',
    legalComments: 'eof',
  });
  await fs.writeFile(
    path.join(folder, 'index.html'),
    html(app?.name || 'Frame Apps'),
  );
  await fs.writeFile(
    path.join(folder, 'icon.png'),
    widgetIcon(app?.id || 'snake', app?.color || '#c8df90'),
  );
  await fs.copyFile(
    path.join(workspace, 'LICENSE'),
    path.join(folder, 'LICENSE'),
  );
  await fs.copyFile(
    path.join(workspace, 'node_modules/@fontsource/jetbrains-mono/LICENSE'),
    path.join(folder, 'FONT-LICENSE.txt'),
  );
  if (app) await fs.writeFile(path.join(folder, 'config.xml'), manifest(app));
  const js = await fs.readFile(path.join(folder, 'bundle.js')),
    css = await fs.readFile(path.join(folder, 'bundle.css'));
  const buildId = createHash('sha256')
    .update(js)
    .update(css)
    .digest('hex')
    .slice(0, 12);
  const bytes = js.length + css.length;
  await fs.appendFile(
    path.join(folder, 'bundle.js'),
    `\nwindow.FRAME_SUITE_BUILD_ID=${JSON.stringify(buildId)};\n`,
  );
  console.log(
    `${app?.name || 'Browser library'}: ${(bytes / 1024).toFixed(1)} KiB JS/CSS, build ${buildId}`,
  );
  return { ...app, folder: app?.id || 'preview', buildId, bytes };
}
const results = [];
for (const app of selected) results.push(await buildApp(app));
await buildApp(null);
await fs.writeFile(
  path.join(output, 'catalog.json'),
  JSON.stringify(apps, null, 2) + '\n',
);
await fs.writeFile(
  path.join(output, 'builds.json'),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  `Built ${results.length} TV app${results.length === 1 ? '' : 's'} and the browser library. All assets are local.`,
);
