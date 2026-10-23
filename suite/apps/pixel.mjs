import { pixelHistory } from '../engines/studio.mjs';
import './studio.css';
const COLORS = [
  '#172017',
  '#db7169',
  '#dda86e',
  '#c8df90',
  '#9ebcd4',
  '#b99ab9',
  '#f1f2e9',
  '#7c8974',
];
const NAMES = [
  'Ink',
  'Coral',
  'Sand',
  'LCD green',
  'Sky',
  'Mauve',
  'Paper',
  'Stone',
];
export function mount(root, context) {
  const width = 32,
    height = 20;
  let pixels = context.storage.get('picture', Array(width * height).fill(6));
  if (
    !Array.isArray(pixels) ||
    pixels.length !== width * height ||
    !pixels.every((v) => Number.isInteger(v) && v >= 0 && v < COLORS.length)
  )
    pixels = Array(width * height).fill(6);
  let color = 0,
    editing = false,
    viewing = false,
    cursor = [16, 10],
    dirty = false;
  const history = pixelHistory();
  root.innerHTML =
    '<section class="studio-app pixel-app"><header class="studio-head"><div><h1>Pixel Studio</h1><p>A small canvas for the big screen.</p></div><div class="studio-actions"><button data-edit>Draw with remote</button><button data-save>Save picture</button><button data-view>View picture</button><button data-export>Export PNG</button></div></header><div class="studio-main"><div class="studio-panel canvas-panel"><canvas width="960" height="600" tabindex="0" data-board aria-label="32 by 20 pixel drawing"></canvas></div><aside class="studio-panel pixel-tools"><h2>Palette</h2><div class="palette">' +
    COLORS.map(
      (c, i) =>
        `<button class="swatch" data-color="${i}" style="--swatch:${c}" aria-label="${NAMES[i]}" title="${NAMES[i]}"></button>`,
    ).join('') +
    '</div><p data-colour>Ink selected</p><div class="studio-actions"><button data-erase>Erase</button><button data-undo>Undo</button><button data-redo>Redo</button><button data-clear>Clear</button></div><p class="studio-muted" data-status>Choose Draw with remote, then use arrows and OK.</p><p class="studio-muted">Back leaves drawing mode so you can change colour or save.</p></aside></div></section>';
  const q = (s) => root.querySelector(s),
    canvas = q('canvas'),
    ctx = canvas.getContext('2d');
  q('[data-export]').hidden = !!window.tizen;
  function draw(clean = false, target = ctx) {
    const cw = canvas.width / width,
      ch = canvas.height / height;
    target.clearRect(0, 0, 960, 600);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        target.fillStyle = COLORS[pixels[y * width + x]];
        target.fillRect(x * cw, y * ch, cw, ch);
        if (!clean && !viewing) {
          target.strokeStyle = '#20301c28';
          target.lineWidth = 1;
          target.strokeRect(x * cw, y * ch, cw, ch);
        }
      }
    if (editing && !clean) {
      target.strokeStyle = '#162713';
      target.lineWidth = 5;
      target.strokeRect(cursor[0] * cw + 2, cursor[1] * ch + 2, cw - 4, ch - 4);
      target.strokeStyle = '#ffffff';
      target.lineWidth = 2;
      target.strokeRect(cursor[0] * cw + 3, cursor[1] * ch + 3, cw - 6, ch - 6);
    }
    root
      .querySelectorAll('[data-color]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', Number(b.dataset.color) === color),
      );
    q('[data-edit]').textContent = editing
      ? 'Finish drawing'
      : 'Draw with remote';
    q('[data-view]').textContent = viewing ? 'Show grid' : 'View picture';
  }
  function edit(on) {
    editing = on;
    viewing = false;
    draw();
    if (on) {
      canvas.focus();
      q('[data-status]').textContent =
        'Arrows move the cursor. OK paints. Back finishes.';
    } else {
      q('[data-edit]').focus();
      q('[data-status]').textContent = dirty
        ? 'Unsaved changes. Choose Save picture.'
        : 'Choose a colour or start drawing.';
    }
  }
  function paint(x, y) {
    if (
      x < 0 ||
      y < 0 ||
      x >= width ||
      y >= height ||
      pixels[y * width + x] === color
    )
      return;
    history.push(pixels);
    pixels[y * width + x] = color;
    dirty = true;
    draw();
  }
  canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect(),
      x = Math.floor(((e.clientX - r.left) / r.width) * width),
      y = Math.floor(((e.clientY - r.top) / r.height) * height);
    cursor = [
      Math.min(width - 1, Math.max(0, x)),
      Math.min(height - 1, Math.max(0, y)),
    ];
    editing = true;
    viewing = false;
    canvas.focus();
    paint(...cursor);
    draw();
  };
  root.querySelectorAll('[data-color]').forEach(
    (b) =>
      (b.onclick = () => {
        color = Number(b.dataset.color);
        q('[data-colour]').textContent = `${NAMES[color]} selected`;
        draw();
      }),
  );
  q('[data-edit]').onclick = () => edit(!editing);
  q('[data-save]').onclick = () => {
    const saved = context.storage.set('picture', pixels);
    dirty = !saved;
    q('[data-status]').textContent = saved
      ? 'Saved on this TV.'
      : 'Storage is unavailable. Keep this app open to keep your picture.';
    context.announce(q('[data-status]').textContent);
  };
  q('[data-view]').onclick = () => {
    viewing = !viewing;
    editing = false;
    draw();
  };
  q('[data-undo]').onclick = () => {
    pixels = history.undo(pixels);
    dirty = true;
    draw();
  };
  q('[data-redo]').onclick = () => {
    pixels = history.redo(pixels);
    dirty = true;
    draw();
  };
  q('[data-clear]').onclick = () => {
    history.push(pixels);
    pixels = Array(width * height).fill(6);
    dirty = true;
    draw();
  };
  q('[data-erase]').onclick = () => {
    color = 6;
    q('[data-colour]').textContent = 'Paper / eraser selected';
    draw();
  };
  q('[data-export]').onclick = () => {
    const output = document.createElement('canvas');
    output.width = 960;
    output.height = 600;
    draw(true, output.getContext('2d'));
    const a = document.createElement('a');
    a.href = output.toDataURL('image/png');
    a.download = 'frame-pixel.png';
    a.click();
    q('[data-status]').textContent = 'PNG download requested.';
  };
  draw();
  context.setHelp(
    'Draw mode: arrows move · OK paints · Back finishes · Save keeps your picture',
  );
  return {
    handleKey(e) {
      if (!editing) {
        if (document.activeElement === canvas && e.key === 'Enter') {
          edit(true);
          return true;
        }
        return false;
      }
      if (e.key === 'Escape') {
        edit(false);
        return true;
      }
      const d = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[e.key];
      if (d) {
        cursor = [
          (cursor[0] + d[0] + width) % width,
          (cursor[1] + d[1] + height) % height,
        ];
        draw();
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        paint(...cursor);
        return true;
      }
      return false;
    },
    suspend() {
      if (editing) edit(false);
    },
    destroy() {
      root.replaceChildren();
    },
  };
}
