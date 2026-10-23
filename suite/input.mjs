const codes = {
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown',
  13: 'Enter',
  27: 'Escape',
  32: ' ',
  10009: 'Escape',
  10252: ' ',
  415: ' ',
  19: ' ',
};
export function normalizeKey(event) {
  return (
    codes[event.keyCode] ||
    {
      Esc: 'Escape',
      Return: 'Enter',
      MediaPlayPause: ' ',
      MediaPlay: ' ',
      MediaPause: ' ',
      Spacebar: ' ',
    }[event.key] ||
    event.key
  );
}

// Prefer controls in the same row or column before a more distant diagonal.
export function nextControl(current, candidates, key) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const cx = current.x + current.width / 2,
    cy = current.y + current.height / 2;
  let best = null,
    bestScore = Infinity;
  for (const candidate of candidates) {
    const dx = candidate.x + candidate.width / 2 - cx,
      dy = candidate.y + candidate.height / 2 - cy;
    const along = (horizontal ? dx : dy) * sign;
    const across = Math.abs(horizontal ? dy : dx);
    if (along <= 1) continue;
    const score =
      along +
      across * 4 +
      (across > (horizontal ? current.height : current.width) / 2 ? 1000 : 0);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function createStorage(id, storage, onFailure = () => {}) {
  const prefix = `democratizen:${id}:`;
  const memory = new Map();
  return {
    get(key, fallback) {
      try {
        const value = storage?.getItem(prefix + key);
        return value === null || value === undefined
          ? memory.has(key)
            ? memory.get(key)
            : fallback
          : JSON.parse(value);
      } catch {
        return memory.has(key) ? memory.get(key) : fallback;
      }
    },
    set(key, value) {
      memory.set(key, JSON.parse(JSON.stringify(value)));
      try {
        if (!storage) throw new Error('Storage unavailable');
        storage.setItem(prefix + key, JSON.stringify(value));
        return true;
      } catch {
        onFailure(
          'Storage is full or unavailable. Changes will last for this session only.',
        );
        return false;
      }
    },
  };
}
