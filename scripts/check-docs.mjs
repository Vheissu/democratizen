import fs from 'node:fs';
import path from 'node:path';
import { workspace } from './frame-config.mjs';

const files = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'THIRD_PARTY.md', ...fs.readdirSync(path.join(workspace, 'docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
let links = 0;
const errors = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(workspace, file), 'utf8');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    links++;
    if (!fs.existsSync(path.resolve(workspace, path.dirname(file), target))) errors.push(`${file}: missing ${target}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Checked ${links} local links across ${files.length} Markdown documents.`);
