import { clampNumber } from '../engines/studio.mjs';
import './studio.css';
export function mount(root, context) {
  const tracks = ['Rain', 'Brown noise', 'Ocean'];
  let levels = context.storage.get('levels', [60, 0, 0]);
  levels = tracks.map((_, i) =>
    clampNumber(levels?.[i], 0, 100, i === 0 ? 60 : 0),
  );
  let volume = clampNumber(context.storage.get('volume', 35), 0, 100, 35),
    sleepMinutes = 0,
    sleepDeadline = 0,
    audio = null,
    master = null,
    nodes = [],
    gains = [],
    playing = false,
    disposed = false,
    request = 0;
  root.innerHTML =
    '<section class="studio-app soundscape-app"><header class="studio-head"><div><h1>Soundscape</h1><p>Rain, brown noise and ocean. Mix the room you want.</p></div><div class="studio-actions"><button data-play>Play mix</button><button data-stop>Stop</button></div></header><div class="studio-main"><div class="studio-panel sound-mixer"><div class="soundwave" aria-hidden="true">' +
    '<i></i>'.repeat(17) +
    '</div><div class="mixer-tracks">' +
    tracks
      .map(
        (name, i) =>
          `<label>${name}<strong data-level-label="${i}">${levels[i]}%</strong><input data-level="${i}" type="range" min="0" max="100" step="5" value="${levels[i]}"></label>`,
      )
      .join('') +
    '</div><p class="studio-muted">These sounds are synthesised on the TV. No streaming or downloads.</p></div><aside class="studio-panel"><h2>Mix controls</h2><label>Volume <strong data-volume-label></strong><input data-volume type="range" min="0" max="100" step="5"></label><p class="studio-muted">Sleep timer</p><div class="studio-choice"><button data-min="0">Off</button><button data-min="15">15 min</button><button data-min="30">30 min</button><button data-min="60">60 min</button></div><p class="sound-status" data-status>Stopped</p><p class="studio-muted" data-sleep></p><p class="studio-muted">OK adjusts a slider. Left/right changes it. OK finishes.</p></aside></div></section>';
  const q = (s) => root.querySelector(s),
    app = q('.soundscape-app');
  q('[data-volume]').value = volume;
  function status(text) {
    if (disposed) return;
    q('[data-status]').textContent = text;
    app.dataset.playing = playing;
  }
  function buffer(brown = false) {
    const b = audio.createBuffer(1, audio.sampleRate * 6, audio.sampleRate),
      data = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else data[i] = white;
    }
    return b;
  }
  function cleanNodes() {
    for (const node of nodes) {
      try {
        node.stop?.();
      } catch {}
      try {
        node.disconnect();
      } catch {}
    }
    nodes = [];
    gains = [];
    master = null;
  }
  function stop() {
    request++;
    playing = false;
    sleepDeadline = 0;
    cleanNodes();
    audio?.suspend().catch(() => {});
    status('Stopped');
    updateSleep();
  }
  function updateSleep() {
    if (disposed) return;
    q('[data-sleep]').textContent = sleepDeadline
      ? `${Math.max(0, Math.ceil((sleepDeadline - Date.now()) / 60000))} minutes until stop`
      : sleepMinutes
        ? `Stops ${sleepMinutes} minutes after Play`
        : 'Sleep timer off';
  }
  async function play() {
    const token = ++request;
    cleanNodes();
    playing = false;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio synthesis is unavailable on this TV.');
      audio ??= new Audio();
      await audio.resume();
      if (disposed || token !== request) return;
      if (audio.state !== 'running')
        throw new Error('Select Play again to enable TV audio.');
      master = audio.createGain();
      master.gain.value = (volume / 100) * 0.35;
      master.connect(audio.destination);
      nodes.push(master);
      const white = buffer(),
        brown = buffer(true);
      tracks.forEach((name, i) => {
        const source = audio.createBufferSource(),
          filter = audio.createBiquadFilter(),
          gain = audio.createGain();
        source.buffer = i === 1 ? brown : white;
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = 6;
        filter.type = i === 0 ? 'highpass' : 'lowpass';
        filter.frequency.value = i === 0 ? 1200 : i === 1 ? 350 : 650;
        filter.Q.value = 0.5;
        gain.gain.value = (levels[i] / 100) * (i === 2 ? 0.65 : 1);
        source.connect(filter).connect(gain).connect(master);
        source.start(0, i * 0.7);
        gains.push(gain);
        nodes.push(source, filter, gain);
        if (i === 2) {
          const wave = audio.createOscillator(),
            depth = audio.createGain();
          wave.frequency.value = 0.11;
          depth.gain.value = (levels[i] / 100) * 0.3;
          wave.connect(depth).connect(gain.gain);
          wave.start();
          nodes.push(wave, depth);
          gain._depth = depth;
        }
      });
      playing = true;
      sleepDeadline = sleepMinutes ? Date.now() + sleepMinutes * 60000 : 0;
      status(
        levels.some(Boolean)
          ? 'Playing your mix'
          : 'Playing · raise a track to hear it',
      );
      updateSleep();
    } catch (error) {
      cleanNodes();
      playing = false;
      status(error.message);
      context.announce(error.message);
    }
  }
  function labels() {
    q('[data-volume-label]').textContent = `${volume}%`;
    root
      .querySelectorAll('[data-min]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', Number(b.dataset.min) === sleepMinutes),
      );
  }
  root.querySelectorAll('[data-level]').forEach(
    (b) =>
      (b.oninput = () => {
        const i = Number(b.dataset.level);
        levels[i] = Number(b.value);
        q(`[data-level-label="${i}"]`).textContent = `${levels[i]}%`;
        if (gains[i]) {
          gains[i].gain.setTargetAtTime(
            (levels[i] / 100) * (i === 2 ? 0.65 : 1),
            audio.currentTime,
            0.08,
          );
          if (i === 2)
            gains[i]._depth.gain.setTargetAtTime(
              (levels[i] / 100) * 0.3,
              audio.currentTime,
              0.08,
            );
        }
        context.storage.set('levels', levels);
        if (playing)
          status(
            levels.some(Boolean)
              ? 'Playing your mix'
              : 'Playing · raise a track to hear it',
          );
      }),
  );
  q('[data-volume]').oninput = (e) => {
    volume = Number(e.target.value);
    if (master)
      master.gain.setTargetAtTime(
        (volume / 100) * 0.35,
        audio.currentTime,
        0.08,
      );
    context.storage.set('volume', volume);
    labels();
  };
  root.querySelectorAll('[data-min]').forEach(
    (b) =>
      (b.onclick = () => {
        sleepMinutes = Number(b.dataset.min);
        sleepDeadline =
          playing && sleepMinutes ? Date.now() + sleepMinutes * 60000 : 0;
        labels();
        updateSleep();
      }),
  );
  q('[data-play]').onclick = play;
  q('[data-stop]').onclick = stop;
  const interval = setInterval(() => {
    if (sleepDeadline && Date.now() >= sleepDeadline) {
      stop();
      status('Sleep timer finished');
      context.announce('Soundscape sleep timer finished');
    }
    updateSleep();
  }, 1000);
  labels();
  updateSleep();
  context.setHelp(
    'Arrows choose controls · OK adjusts · Play starts audio · Back stops',
  );
  return {
    handleKey(e) {
      if (e.key === 'Escape' && (playing || nodes.length)) {
        stop();
        return true;
      }
      if (e.key === ' ') {
        playing ? stop() : play();
        return true;
      }
      return false;
    },
    suspend: stop,
    destroy() {
      stop();
      disposed = true;
      clearInterval(interval);
      audio?.close().catch(() => {});
      root.replaceChildren();
    },
  };
}
