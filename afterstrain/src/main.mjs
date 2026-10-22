import './style.css';
import world from './data/world.json';
import { ARCHETYPES, SCENARIOS, TRAITS, BRANCHES, SYNERGIES } from './catalog.mjs';
import { createGame, tick, totals, stats, evolve, devolve, cost, canEvolve, serialize, restore } from './engine.mjs';

const root = document.querySelector('#app');
const saveKey = 'afterstrain-save-v1';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const compact = value => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = value => `${(value * 100).toFixed(1)}%`;
const button = (label, action, extra = '') => `<button data-action="${action}" data-key="${action}" ${extra}>${label}</button>`;
let state;
let screen = 'menu';
let speed = 0;
let selected = 0;
let branch = 0;
let setup = { name: 'Echo / 001', seed: newSeed(), archetype: 'echo', scenario: 'frontier', difficulty: 1, chaos: 1, origin: 'random' };
let notice = '';
let saved = readSave();
let showRoutes = true;
let sound = false;
let audioContext;
let previousButtons = [];
let lastMove = 0;
let lastFrame = 0;
const paths = world.map(country => {
  const path = new Path2D();
  for (const ring of country.rings) {
    ring.forEach(([longitude, latitude], index) => {
      const horizontal = longitude + 180;
      const vertical = 90 - latitude;
      if (index === 0 || Math.abs(longitude - ring[index - 1][0]) > 180) path.moveTo(horizontal, vertical);
      else path.lineTo(horizontal, vertical);
    });
    path.closePath();
  }
  return path;
});
function newSeed() { return `AS-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`; }
function readSave() {
  try { return restore(localStorage.getItem(saveKey), world); } catch { return null; }
}
function save() {
  if (!state) return;
  try { localStorage.setItem(saveKey, serialize(state)); saved = state; }
  catch { notice = 'Storage is unavailable. Export your run to keep it.'; }
}
function chirp() {
  if (!sound) return;
  try {
    audioContext ||= new AudioContext();
    audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 320;
    gain.gain.setValueAtTime(0.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + 0.08);
  } catch { sound = false; }
}
function logo() { return '<div class="brand"><span class="brand-symbol">◉</span> AFTERSTRAIN<span class="edition">FIELD EDITION / 01</span></div>'; }
function header() {
  return `<header>${logo()}<div class="header-actions">${button(sound ? 'Sound on' : 'Sound off', 'sound')}${button('Field guide', 'help')}${state ? button('Save & exit', 'exit') : ''}</div></header>`;
}
function footer() { return '<footer><span>FICTIONAL SYSTEMS. UNWRITTEN OUTCOMES.</span><span>Touch · D-pad / arrows · A / Enter select · B / Back return · Start / Space pause</span></footer>'; }
function render(focusKey) {
  const oldFocus = focusKey || document.activeElement?.dataset.key;
  const scroll = document.querySelector('.content')?.scrollTop || 0;
  let content = '';
  if (screen === 'menu') content = `<section class="landing"><div class="landing-copy"><p class="eyebrow">A WORLD THAT NEVER PLAYS THE SAME</p><h1>One signal.<br>Everywhere.</h1><p class="lede">Build a strain. Follow its unexpected turns.<br>Adapt before the world catches up.</p><div class="menu-actions">${button('Create a strain <span>↗</span>', 'setup', 'class="primary"')}${saved ? button(`Continue · day ${saved.day}`, 'continue') : ''}${button('Daily expedition', 'daily')}${button('Import saved run', 'import')}</div><div class="landing-note"><span>176</span> regions <i></i><span>48</span> evolving traits <i></i><span>Your</span> rules</div></div><div class="specimen-caption">SPECIMEN 001 / ECHO BLOOM<br><span>Its next form is up to you.</span></div></section>`;
  else if (screen === 'setup') content = setupView();
  else if (screen === 'help') content = `<section class="guide content"><p class="eyebrow">FIELD GUIDE</p><h1>Start small.<br>Keep adapting.</h1><div class="guide-grid"><article><h2>01 / Establish</h2><p>Choose a strain, a starting region, and a world seed. Influence grows locally and travels along the routes on the map. The regional populations and conditions are generated for play, not real-world statistics.</p></article><article><h2>02 / Evolve</h2><p>Earn 2 evolution points every five days and for every new region. Global influence milestones award 5 more. Open the lab to buy traits in eight branches. Each trait has three ranks. Earlier traits unlock later ones.</p></article><article><h2>03 / Read the world</h2><p>Awareness fuels research and closes borders. Concealment delays awareness. Resilience slows research. Heat and cold adaptations help in matching climates. Disruption increases awareness: avoid it in a quiet-world run.</p></article><article><h2>04 / Change course</h2><p>Events alter travel, climate, awareness, and research for a limited time. Mutations add free traits, sometimes with unwanted effects. Suppress traits in the lab for no refund. Dependent traits must be suppressed first.</p></article><article><h2>Play from the sofa</h2><p>D-pad or left stick moves focus. A selects; B returns. Start pauses. Shoulder buttons change regions. TV remote arrows and OK work too; Back returns. All setup choices work without typing. On touchscreens, tap regions or use the region arrows.</p></article><article><h2>Keep your run</h2><p>The game saves every five days, on purchases, and when you leave the screen. It pauses in the lab and when hidden. Export a save to move between devices. Identical seeds and decisions reproduce a run. New seeds give new worlds.</p></article></div>${button('Return', 'back', 'class="primary"')}</section>`;
  else if (state) content = gameView();
  root.innerHTML = `${header()}${notice ? `<div class="notice" role="status">${escape(notice)} ${button('Dismiss', 'dismiss')}</div>` : ''}${content}${footer()}<input type="file" id="import-file" accept=".json,application/json" hidden />`;
  document.querySelector('#import-file').addEventListener('change', importFile);
  if (screen === 'world') drawMap();
  const candidates = [...root.querySelectorAll('button,input')];
  const focus = candidates.find(node => node.dataset.key === oldFocus && !node.disabled) || candidates.find(node => node.matches('.primary')) || candidates.find(node => !node.disabled);
  if (focus && !document.activeElement?.matches('input')) focus.focus({ preventScroll: true });
  if (document.querySelector('.content')) document.querySelector('.content').scrollTop = scroll;
}
function setupView() {
  const archetype = ARCHETYPES.find(item => item.id === setup.archetype);
  const scenario = SCENARIOS.find(item => item.id === setup.scenario);
  const origin = world.find(item => item.id === setup.origin);
  return `<section class="setup content"><div class="section-heading"><div><p class="eyebrow">NEW EXPEDITION</p><h1>Write the first chapter.</h1></div>${button('Back', 'back')}</div><div class="setup-grid"><div class="specimen"><div class="specimen-label">${escape(archetype.name)}<small>${archetype.description}</small></div></div><div class="settings"><label>STRAIN NAME<input data-key="name" id="strain-name" maxlength="40" value="${escape(setup.name)}" /></label><div class="setting"><span>ORGANISM</span>${button(`${archetype.name} <b>→</b>`, 'organism')}</div><div class="setting"><span>SCENARIO</span>${button(`${scenario.name} <b>→</b>`, 'scenario')}<p>${scenario.description}</p></div><div class="settings-pair"><div class="setting"><span>RESPONSE</span>${button(`${setup.difficulty === 0.6 ? 'Relaxed' : setup.difficulty === 1 ? 'Standard' : 'Relentless'} →`, 'difficulty')}</div><div class="setting"><span>WORLD VOLATILITY</span>${button(`${setup.chaos === 0.5 ? 'Measured' : setup.chaos === 1 ? 'Restless' : 'Chaotic'} →`, 'chaos')}</div></div><div class="setting"><span>STARTING REGION</span><div class="origin-control">${button('←', 'origin-prev', 'aria-label="Previous starting region"')}${button(origin ? escape(origin.name) : 'Surprise me', 'origin-random')}${button('→', 'origin-next', 'aria-label="Next starting region"')}</div></div><label>WORLD SEED<div class="seed-row"><input data-key="seed" id="world-seed" maxlength="80" value="${escape(setup.seed)}" />${button('Shuffle', 'shuffle')}</div></label><p class="muted">Same seed, same starting world. Your decisions change what follows.</p>${button('Release the first signal <span>↗</span>', 'start', 'class="primary"')}</div></div></section>`;
}
function gameView() {
  const total = totals(state);
  const scenario = SCENARIOS.find(item => item.id === state.scenario);
  const tabs = `<nav aria-label="Game sections">${[['world', 'World'], ['lab', 'Evolution'], ['news', 'Dispatches'], ['archive', 'Run record']].map(([id, label]) => button(label, `tab-${id}`, `class="${screen === id ? 'active' : ''}" aria-current="${screen === id ? 'page' : 'false'}"`)).join('')}</nav>`;
  const hud = `<section class="hud"><div class="run-name"><span>${escape(state.name)}</span><small>${scenario.name} / DAY ${String(state.day).padStart(3, '0')}</small></div><div><small>INFLUENCE</small><strong>${percent(total.fraction)}</strong><div class="meter"><i style="width:${total.fraction * 100}%"></i></div></div><div><small>EVOLUTION</small><strong class="amber">${state.scenario === 'sandbox' ? '∞' : state.points}<em> EP</em></strong></div><div><small>AWARENESS</small><strong>${state.awareness.toFixed(1)}%</strong></div><div><small>RESEARCH</small><strong class="coral">${state.research.toFixed(1)}%</strong><div class="meter coral"><i style="width:${state.research}%"></i></div></div></section>`;
  const end = state.status !== 'playing' ? `<section class="result" role="status"><div><p class="eyebrow">EXPEDITION COMPLETE</p><h2>${state.status === 'won' ? 'A world rewritten.' : 'The world held its ground.'}</h2><p>${percent(total.fraction)} influence across ${total.reached} regions in ${state.day} days.</p></div>${button('Build another strain', 'setup', 'class="primary"')}</section>` : '';
  let body = '';
  if (screen === 'world') {
    const country = state.countries[selected];
    body = `<section class="world-layout"><div class="map-panel"><div class="map-heading"><p class="eyebrow">LIVE ATLAS <span class="live-dot"></span></p><span>${total.reached} / ${world.length} REGIONS</span></div><canvas id="map" aria-label="World influence map. Use the region buttons to inspect every country."></canvas><div class="map-legend"><span><i class="legend-dot"></i> Your influence</span><span>Outline: selected region</span>${button(showRoutes ? 'Hide routes' : 'Show routes', 'routes')}</div><div class="timeline"><div><span class="eyebrow">SIMULATION</span><strong>${speed ? `${speed}× running` : 'Paused'}</strong></div><div class="speed-buttons">${[0, 1, 3, 8].map(value => button(value === 0 ? 'Ⅱ' : `${value}×`, `speed-${value}`, `class="${speed === value ? 'active' : ''}" aria-label="${value === 0 ? 'Pause' : `Speed ${value}`}"`)).join('')}${button('+1 day', 'step')}</div></div></div><aside><p class="eyebrow">REGION INTELLIGENCE</p><div class="country-select">${button('←', 'region-prev', 'aria-label="Previous region"')}<h2>${escape(country.name)}</h2>${button('→', 'region-next', 'aria-label="Next region"')}</div><span class="tag">${country.closed ? 'BORDERS RESTRICTED' : 'BORDERS OPEN'}</span><dl><div><dt>Influence</dt><dd>${percent(country.influence)}</dd></div><div><dt>Population (simulated)</dt><dd>${compact(country.population)}</dd></div><div><dt>Climate</dt><dd>${Math.round(country.temperature + (scenario.temperature || 0))}°</dd></div><div><dt>Health capacity</dt><dd>${Math.round(country.health * 100)}%</dd></div><div><dt>Disruption</dt><dd>${percent(country.disruption)}</dd></div><div><dt>Travel links</dt><dd>${country.routes.length}</dd></div></dl><div class="objective"><small>YOUR OBJECTIVE</small><p>${scenario.description}</p><div class="meter"><i style="width:${Math.min(100, total.fraction / scenario.target * 100)}%"></i></div></div>${button('Open evolution lab ↗', 'tab-lab', 'class="primary"')}<p class="muted">${state.events.filter(event => event.country === country.id).map(event => `${escape(event.title)} (${event.until - state.day} days)`).join('<br>') || 'No active regional events.'}</p></aside></section><div class="news-ticker"><span>DISPATCH / ${state.news[0]?.day || 0}</span><p>${escape(state.news[0]?.title || '')}</p>${button('Read all →', 'tab-news')}</div>`;
  } else if (screen === 'lab') {
    const attributes = stats(state);
    body = `<section class="lab content"><div class="section-heading"><div><p class="eyebrow">EVOLUTION LAB / TIME PAUSED</p><h2>Change what comes next.</h2></div><span class="tag amber">${state.scenario === 'sandbox' ? 'UNLIMITED' : state.points} EP AVAILABLE</span></div><div class="branch-tabs">${BRANCHES.map((item, index) => button(item.name, `branch-${index}`, `class="${branch === index ? 'active' : ''}"`)).join('')}</div><div class="trait-grid">${TRAITS.filter(trait => trait.branch === BRANCHES[branch].id).map(trait => {
      const rank = state.traits[trait.id] || 0;
      const locked = trait.requires && !state.traits[trait.requires];
      return `<article class="trait ${locked ? 'locked' : ''}"><div class="trait-top"><span>0${trait.tier + 1} / ${trait.stat.toUpperCase()}</span><span class="ranks">${'●'.repeat(rank)}${'○'.repeat(3 - rank)}</span></div><h3>${trait.name}</h3><p>${trait.description} +${Math.round(trait.value * 100)}% per rank.</p><small>${locked ? `Requires ${TRAITS.find(item => item.id === trait.requires).name}` : rank === 3 ? 'Fully evolved' : `Next rank: ${cost(state, trait)} EP`}</small><div class="trait-actions">${button(rank === 3 ? 'Max rank' : locked ? 'Locked' : 'Evolve +', `evolve-${trait.id}`, `${canEvolve(state, trait) ? '' : 'disabled'} class="${canEvolve(state, trait) ? 'primary' : ''}"`)}${rank ? button('Suppress', `suppress-${trait.id}`, state.status !== 'playing' || (rank === 1 && TRAITS.some(item => item.requires === trait.id && state.traits[item.id])) ? 'disabled' : '') : ''}</div></article>`;
    }).join('')}</div><div class="synergies"><h3>Combinations worth exploring</h3>${SYNERGIES.map(item => `<p class="${item.needs.every(id => state.traits[id]) ? 'unlocked' : ''}"><strong>${item.name}</strong> · ${item.needs.map(id => TRAITS.find(trait => trait.id === id).name).join(' + ')} → +${Math.round(item.value * 100)}% ${item.stat}</p>`).join('')}</div><p class="muted">Current profile: ${Object.entries(attributes).map(([key, value]) => `${key} ${value.toFixed(2)}`).join(' · ')}</p></section>`;
  } else if (screen === 'news') body = `<section class="dispatches content"><p class="eyebrow">WORLD DISPATCHES / TIME PAUSED</p><h2>The world has its own plans.</h2><div class="event-strip">${state.events.length ? state.events.map(event => `<article><span>${event.until - state.day} DAYS LEFT</span><h3>${escape(state.countries.find(country => country.id === event.country).name)}</h3><p>${escape(event.title)}</p></article>`).join('') : '<p>No active events. Keep the simulation running.</p>'}</div><ol class="news-list">${state.news.map(item => `<li><time>DAY ${String(item.day).padStart(3, '0')}</time><span>${escape(item.title)}</span></li>`).join('')}</ol></section>`;
  else body = `<section class="archive content"><p class="eyebrow">RUN RECORD / TIME PAUSED</p><h2>${escape(state.name)}</h2><p>World seed <strong>${escape(state.seed)}</strong> · ${ARCHETYPES.find(item => item.id === state.archetype).name} · ${scenario.name}</p><div class="record-grid"><article><span>${total.reached}</span><p>regions reached</p></article><article><span>${compact(total.influenced)}</span><p>people influenced</p></article><article><span>${Object.values(state.traits).reduce((sum, rank) => sum + rank, 0)}</span><p>evolution ranks</p></article></div><h3>Influence over time</h3><div class="history-chart" aria-label="Influence over time">${state.history.length ? state.history.map(item => `<div style="height:${Math.max(2, item.influence * 100)}%" title="Day ${item.day}: ${percent(item.influence)}"></div>`).join('') : '<p>Advance five days to begin the record.</p>'}</div><div class="record-actions">${button('Export saved run', 'export', 'class="primary"')}${button('Save now', 'save')}${button('New expedition', 'setup')}</div><p class="muted">A save contains the seed, complete simulation state, and random generator position. No account or connection is required.</p></section>`;
  return hud + tabs + end + body;
}
function drawMap() {
  const canvas = document.querySelector('#map');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = bounds.width * ratio; canvas.height = bounds.height * ratio;
  context.scale(canvas.width / 360, canvas.height / 180);
  context.lineWidth = 0.18;
  context.strokeStyle = '#173431';
  for (let longitude = 0; longitude <= 360; longitude += 30) { context.beginPath(); context.moveTo(longitude, 0); context.lineTo(longitude, 180); context.stroke(); }
  for (let latitude = 0; latitude <= 180; latitude += 30) { context.beginPath(); context.moveTo(0, latitude); context.lineTo(360, latitude); context.stroke(); }
  state.countries.forEach((country, index) => {
    context.fillStyle = country.influence > 0 ? `hsl(${165 - country.influence * 125}  ${35 + country.influence * 40}% ${23 + country.influence * 28}%)` : '#1c3a36';
    context.strokeStyle = '#42615a'; context.lineWidth = 0.2;
    context.fill(paths[index]); context.stroke(paths[index]);
  });
  const country = state.countries[selected];
  context.strokeStyle = '#f0ce8d'; context.lineWidth = 0.7; context.stroke(paths[selected]);
  if (showRoutes) {
    context.strokeStyle = '#c8a66a88'; context.lineWidth = 0.35; context.setLineDash([1.5, 1.5]);
    for (const id of country.routes) {
      const target = state.countries.find(item => item.id === id);
      if (Math.abs(target.center[0] - country.center[0]) > 180) continue;
      context.beginPath(); context.moveTo(country.center[0] + 180, 90 - country.center[1]);
      context.quadraticCurveTo((country.center[0] + target.center[0]) / 2 + 180, 80 - Math.max(country.center[1], target.center[1]), target.center[0] + 180, 90 - target.center[1]); context.stroke();
    }
    context.setLineDash([]);
  }
  context.fillStyle = '#ffdca1'; context.beginPath(); context.arc(country.center[0] + 180, 90 - country.center[1], 1, 0, Math.PI * 2); context.fill();
  canvas.onclick = event => {
    const horizontal = (event.clientX - bounds.left) / bounds.width * 360;
    const vertical = (event.clientY - bounds.top) / bounds.height * 180;
    context.setTransform(1, 0, 0, 1, 0, 0);
    const hit = paths.findIndex(path => context.isPointInPath(path, horizontal, vertical));
    if (hit >= 0) { selected = hit; render(); }
  };
}
function cycle(values, current) { return values[(values.indexOf(current) + 1) % values.length]; }
function back() {
  if (screen === 'world') { speed = 0; save(); screen = 'menu'; }
  else if (screen === 'setup') screen = 'menu';
  else screen = state ? 'world' : 'menu';
  render();
}
function action(command) {
  chirp();
  if (command === 'setup') { speed = 0; save(); screen = 'setup'; }
  else if (command === 'continue') { state = readSave(); if (!state) { notice = 'That save could not be read.'; saved = null; } else { screen = 'world'; speed = 0; selected = state.countries.findIndex(country => country.id === state.origin); } }
  else if (command === 'daily') { setup = { ...setup, seed: `DAILY-${new Date().toISOString().slice(0, 10)}`, archetype: 'echo', scenario: 'frontier', difficulty: 1, chaos: 1, origin: 'random' }; screen = 'setup'; }
  else if (command === 'start') { state = createGame(world, setup); selected = state.countries.findIndex(country => country.id === state.origin); speed = 0; screen = 'world'; save(); }
  else if (command === 'back') return back();
  else if (command === 'exit') { speed = 0; save(); screen = 'menu'; }
  else if (command === 'help') { speed = 0; screen = 'help'; }
  else if (command === 'sound') sound = !sound;
  else if (command === 'organism') setup.archetype = cycle(ARCHETYPES.map(item => item.id), setup.archetype);
  else if (command === 'scenario') setup.scenario = cycle(SCENARIOS.map(item => item.id), setup.scenario);
  else if (command === 'difficulty') setup.difficulty = cycle([0.6, 1, 1.6], setup.difficulty);
  else if (command === 'chaos') setup.chaos = cycle([0.5, 1, 2], setup.chaos);
  else if (command === 'shuffle') setup.seed = newSeed();
  else if (command === 'origin-random') setup.origin = 'random';
  else if (command.startsWith('origin-')) { const index = world.findIndex(item => item.id === setup.origin); setup.origin = world[(index + (command === 'origin-next' ? 1 : world.length - 1)) % world.length].id; }
  else if (command.startsWith('tab-')) { speed = 0; save(); screen = command.slice(4); }
  else if (command.startsWith('branch-')) branch = Number(command.slice(7));
  else if (command.startsWith('evolve-')) { evolve(state, command.slice(7)); save(); }
  else if (command.startsWith('suppress-')) { devolve(state, command.slice(9)); save(); }
  else if (command.startsWith('region-')) selected = (selected + (command === 'region-next' ? 1 : world.length - 1)) % world.length;
  else if (command.startsWith('speed-')) speed = state.status === 'playing' ? Number(command.slice(6)) : 0;
  else if (command === 'step') { tick(state); save(); }
  else if (command === 'routes') showRoutes = !showRoutes;
  else if (command === 'dismiss') notice = '';
  else if (command === 'save') { save(); notice = 'Run saved on this device.'; }
  else if (command === 'export') {
    save();
    const url = URL.createObjectURL(new Blob([serialize(state)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'afterstrain-run.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (command === 'import') { document.querySelector('#import-file').click(); return; }
  render();
}
async function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2e6) { notice = 'This file is too large to be a run save.'; render(); return; }
  const imported = restore(await file.text(), world);
  if (!imported) notice = 'This save is invalid or from an unsupported version.';
  else { state = imported; speed = 0; selected = state.countries.findIndex(country => country.id === state.origin); screen = 'world'; save(); notice = 'Run imported. Ready when you are.'; }
  render();
}
root.addEventListener('click', event => { const target = event.target.closest('[data-action]'); if (target && !target.disabled) action(target.dataset.action); });
root.addEventListener('input', event => { if (event.target.id === 'strain-name') setup.name = event.target.value; if (event.target.id === 'world-seed') setup.seed = event.target.value; });
function moveFocus(direction) {
  const nodes = [...root.querySelectorAll('button:not(:disabled), input:not([hidden])')].filter(node => node.getBoundingClientRect().width > 0);
  const active = document.activeElement;
  if (!nodes.includes(active)) { nodes[0]?.focus(); return; }
  const current = active.getBoundingClientRect();
  const origin = { horizontal: current.left + current.width / 2, vertical: current.top + current.height / 2 };
  const candidates = nodes.filter(node => node !== active).map(node => {
    const bounds = node.getBoundingClientRect();
    const horizontal = bounds.left + bounds.width / 2 - origin.horizontal;
    const vertical = bounds.top + bounds.height / 2 - origin.vertical;
    const forward = direction === 'right' ? horizontal : direction === 'left' ? -horizontal : direction === 'down' ? vertical : -vertical;
    const cross = direction === 'right' || direction === 'left' ? Math.abs(vertical) : Math.abs(horizontal);
    return { node, forward, score: forward + cross * 2.5 };
  }).filter(item => item.forward > 4).sort((left, right) => left.score - right.score);
  candidates[0]?.node.focus();
}
document.addEventListener('keydown', event => {
  if (event.target.matches('input') && !['Escape', 'Tab'].includes(event.key)) return;
  const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (directions[event.key]) { event.preventDefault(); moveFocus(directions[event.key]); }
  else if (event.key === 'Escape' || event.key === 'Backspace' || [10009, 461].includes(event.keyCode)) { event.preventDefault(); back(); }
  else if (event.code === 'Space' || event.key === 'MediaPlayPause') { event.preventDefault(); if (state && screen === 'world') action(`speed-${speed ? 0 : 1}`); }
});
function pollController(now) {
  if (now - lastFrame >= 50 && !document.hidden) {
    lastFrame = now;
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (pad) {
      const buttons = pad.buttons.map(item => item.pressed);
      const press = index => buttons[index] && !previousButtons[index];
      if (press(0)) { if (document.activeElement?.matches('input')) document.activeElement.blur(); else document.activeElement?.click(); }
      if (press(1)) back();
      if (press(9) && state && screen === 'world') action(`speed-${speed ? 0 : 1}`);
      if (press(4) && state && screen === 'world') action('region-prev');
      if (press(5) && state && screen === 'world') action('region-next');
      if (now - lastMove > 180) {
        const direction = buttons[12] || pad.axes[1] < -0.55 ? 'up' : buttons[13] || pad.axes[1] > 0.55 ? 'down' : buttons[14] || pad.axes[0] < -0.55 ? 'left' : buttons[15] || pad.axes[0] > 0.55 ? 'right' : null;
        if (direction) { moveFocus(direction); lastMove = now; }
      }
      previousButtons = buttons;
    } else previousButtons = [];
  }
  requestAnimationFrame(pollController);
}
setInterval(() => {
  if (!state || !speed || screen !== 'world' || document.hidden) return;
  for (let count = 0; count < speed; count++) { tick(state); if (state.day % 5 === 0) save(); }
  if (state.status !== 'playing') { speed = 0; save(); }
  render();
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) { speed = 0; save(); } else render(); });
window.addEventListener('pagehide', save);
window.addEventListener('resize', () => { if (screen === 'world') drawMap(); });
render(); requestAnimationFrame(pollController);
