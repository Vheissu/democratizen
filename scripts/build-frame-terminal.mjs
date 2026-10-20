import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { setup, workspace } from './frame-config.mjs';

const { client } = setup();
const output = path.join(workspace, 'dist/frame-terminal');
await fs.mkdir(output, { recursive: true, mode: 0o700 });
await build({ entryPoints: [path.join(workspace, 'app/main.js')], bundle: true, outfile: path.join(output, 'bundle.js'), minify: true, target: 'chrome85', external: ['./mono.woff2'] });
for (const name of ['index.html', 'icon.png']) await fs.copyFile(path.join(workspace, 'app', name), path.join(output, name));
await fs.copyFile(path.join(workspace, 'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'), path.join(output, 'mono.woff2'));
await fs.writeFile(path.join(output, 'connection.js'), `window.FRAME_CONNECTION=${JSON.stringify(client)};\n`, { mode: 0o600 });
await fs.chmod(path.join(output, 'connection.js'), 0o600);
const manifest = (await fs.readFile(path.join(workspace, 'app/config.xml'), 'utf8')).replaceAll('HOST', client.host).replaceAll('4319', String(client.port));
await fs.writeFile(path.join(output, 'config.xml'), manifest);
const licenses = path.join(output, 'licenses');
await fs.mkdir(licenses, { recursive: true });
for (const dependency of ['@xterm/xterm', '@xterm/addon-fit', 'tweetnacl', '@fontsource/jetbrains-mono']) {
  await fs.copyFile(path.join(workspace, 'node_modules', dependency, 'LICENSE'), path.join(licenses, dependency.replaceAll('/', '-') + '.txt'));
}
await fs.copyFile(path.join(workspace, 'LICENSE'), path.join(licenses, 'democratizen.txt'));
await fs.copyFile(path.join(workspace, 'THIRD_PARTY.md'), path.join(output, 'THIRD_PARTY.md'));
console.log(`Built Frame Terminal for ${client.host}:${client.port}`);
