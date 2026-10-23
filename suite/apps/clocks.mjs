import './studio.css';
const zones = [
  { id: 'local', name: 'Local time', zone: undefined },
  { id: 'Brisbane', name: 'Brisbane', zone: 'Australia/Brisbane' },
  { id: 'Sydney', name: 'Sydney', zone: 'Australia/Sydney' },
  { id: 'London', name: 'London', zone: 'Europe/London' },
  { id: 'New York', name: 'New York', zone: 'America/New_York' },
  { id: 'Tokyo', name: 'Tokyo', zone: 'Asia/Tokyo' },
  { id: 'Los Angeles', name: 'Los Angeles', zone: 'America/Los_Angeles' },
  { id: 'Paris', name: 'Paris', zone: 'Europe/Paris' },
  { id: 'Singapore', name: 'Singapore', zone: 'Asia/Singapore' },
  { id: 'Auckland', name: 'Auckland', zone: 'Pacific/Auckland' },
  { id: 'UTC', name: 'UTC', zone: 'UTC' },
];
export function mount(root, context) {
  let chosen = context.storage.get('zones', ['local', 'London', 'Tokyo']);
  if (!Array.isArray(chosen)) chosen = ['local', 'London', 'Tokyo'];
  chosen = [
    ...new Set(chosen.filter((id) => zones.some((z) => z.id === id))),
  ].slice(0, 4);
  if (!chosen.length) chosen = ['local'];
  let use24 = context.storage.get('24-hour', true) !== false,
    editing = false;
  root.innerHTML =
    '<section class="studio-app clocks-app"><header class="studio-head"><div><h1>World Clocks</h1><p>Times and dates follow the TV clock, including local daylight saving.</p></div><div class="studio-actions"><button data-format>24-hour</button><button data-edit>Choose cities</button></div></header><div class="clock-cards" data-cards></div><div class="clock-picker" data-picker hidden><h2>Choose up to four clocks</h2><div class="studio-choice">' +
    zones
      .map((z) => `<button data-zone="${z.id}">${z.name}</button>`)
      .join('') +
    '</div><button data-done>Done</button></div></section>';
  const q = (s) => root.querySelector(s);
  const timeFormat = new Map(),
    dateFormat = new Map();
  function save() {
    context.storage.set('zones', chosen);
    context.storage.set('24-hour', use24);
  }
  function format(date, zone, kind) {
    const key = `${zone || 'local'}:${use24}`,
      cache = kind === 'time' ? timeFormat : dateFormat;
    if (!cache.has(key))
      cache.set(
        key,
        new Intl.DateTimeFormat(undefined, {
          timeZone: zone,
          ...(kind === 'time'
            ? {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: !use24,
              }
            : { weekday: 'long', month: 'short', day: 'numeric' }),
        }),
      );
    return cache.get(key).format(date);
  }
  function render() {
    const now = new Date();
    q('[data-format]').textContent = use24 ? 'Use 12-hour' : 'Use 24-hour';
    q('[data-cards]').dataset.count = chosen.length;
    q('[data-cards]').replaceChildren();
    for (const id of chosen) {
      const z = zones.find((z) => z.id === id),
        card = document.createElement('article');
      card.className = 'studio-panel clock-card';
      const name = document.createElement('h2');
      name.textContent = z.name;
      const time = document.createElement('div');
      time.className = 'clock-time';
      time.textContent = format(now, z.zone, 'time');
      const date = document.createElement('p');
      date.className = 'studio-muted';
      date.textContent = format(now, z.zone, 'date');
      const zone = document.createElement('p');
      zone.className = 'clock-zone';
      zone.textContent =
        z.zone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'TV timezone';
      card.append(name, time, date, zone);
      q('[data-cards]').append(card);
    }
    root.querySelectorAll('[data-zone]').forEach((b) => {
      b.setAttribute('aria-pressed', chosen.includes(b.dataset.zone));
      b.disabled = chosen.length >= 4 && !chosen.includes(b.dataset.zone);
    });
  }
  function edit(on) {
    editing = on;
    q('[data-picker]').hidden = !on;
    q('[data-cards]').hidden = on;
    if (on) q('[data-zone]:not(:disabled)').focus();
    else q('[data-edit]').focus();
  }
  q('[data-format]').onclick = () => {
    use24 = !use24;
    save();
    render();
  };
  q('[data-edit]').onclick = () => edit(!editing);
  q('[data-done]').onclick = () => edit(false);
  root.querySelectorAll('[data-zone]').forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.zone;
        if (chosen.includes(id)) {
          if (chosen.length === 1) {
            context.announce('Keep at least one clock.');
            return;
          }
          chosen = chosen.filter((v) => v !== id);
        } else if (chosen.length < 4) chosen.push(id);
        save();
        render();
      }),
  );
  render();
  const interval = setInterval(render, 1000);
  context.setHelp(
    'Choose cities or change format · OK selects · Back closes city picker',
  );
  return {
    handleKey(e) {
      if (e.key === 'Escape' && editing) {
        edit(false);
        return true;
      }
      return false;
    },
    suspend() {},
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
