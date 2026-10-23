import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, nextControl, normalizeKey } from '../suite/input.mjs';
import { apps, selectApps } from '../suite/catalog.mjs';
import { widgetIcon } from '../scripts/suite-icons.mjs';
import { inflateSync } from 'node:zlib';

test('Samsung Back and media keys work even when the browser key name is missing', () => {
  assert.equal(normalizeKey({ key: 'Unidentified', keyCode: 10009 }), 'Escape');
  assert.equal(normalizeKey({ key: 'Unidentified', keyCode: 10252 }), ' ');
  assert.equal(normalizeKey({ key: 'ArrowRight', keyCode: 39 }), 'ArrowRight');
  assert.equal(normalizeKey({ key: 'Enter', keyCode: 13 }), 'Enter');
});
test('spatial navigation prefers the same row and cannot move backwards', () => {
  const current = { x: 100, y: 100, width: 100, height: 50 };
  const far = { x: 400, y: 100, width: 100, height: 50 },
    diagonal = { x: 230, y: 180, width: 100, height: 50 },
    behind = { x: 0, y: 100, width: 100, height: 50 };
  assert.equal(
    nextControl(current, [diagonal, far, behind], 'ArrowRight'),
    far,
  );
  assert.equal(nextControl(current, [far, diagonal], 'ArrowLeft'), null);
});
test('storage isolates apps, tolerates malformed JSON and reports writes that cannot persist', () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
    };
  const a = createStorage('snake', storage),
    b = createStorage('merge', storage);
  assert.equal(a.set('best', 42), true);
  assert.equal(a.get('best', 0), 42);
  assert.equal(b.get('best', 0), 0);
  data.set('democratizen:merge:best', '{broken');
  assert.equal(b.get('best', 0), 0);
  const messages = [],
    ephemeral = createStorage(
      'snake',
      {
        getItem() {
          throw Error('blocked');
        },
        setItem() {
          throw Error('full');
        },
      },
      (m) => messages.push(m),
    );
  assert.equal(ephemeral.set('best', 55), false);
  assert.equal(ephemeral.get('best', 0), 55);
  assert.equal(messages.length, 1);
});
test('catalogue has twelve independent package IDs and rejects unknown deployment targets', () => {
  assert.equal(apps.length, 12);
  assert.equal(new Set(apps.map((a) => a.appId)).size, 12);
  assert.equal(new Set(apps.map((a) => a.package)).size, 12);
  assert.ok(apps.every((a) => /^[a-zA-Z0-9]{10}$/.test(a.package)));
  assert.equal(selectApps('snake')[0].name, 'Frame Snake');
  assert.throws(() => selectApps('../../anything'));
});
test('every widget has a decodable 117 pixel RGB icon', () => {
  for (const app of apps) {
    const png = widgetIcon(app.id, app.color);
    assert.equal(png.readUInt32BE(16), 117);
    assert.equal(png.readUInt32BE(20), 117);
    let offset = 8;
    const chunks = [];
    while (offset < png.length) {
      const n = png.readUInt32BE(offset),
        type = png.subarray(offset + 4, offset + 8).toString();
      if (type === 'IDAT')
        chunks.push(png.subarray(offset + 8, offset + 8 + n));
      offset += 12 + n;
    }
    assert.equal(
      inflateSync(Buffer.concat(chunks)).length,
      (117 * 3 + 1) * 117,
    );
  }
});
