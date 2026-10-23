export const apps = [
  {
    id: 'snake',
    name: 'Frame Snake',
    widget: 'FrameSnake',
    category: 'Arcade',
    color: '#c8df90',
    description:
      'Nokia-inspired Snake, with three routes, changing obstacles and power-ups.',
    icon: 'snake',
  },
  {
    id: 'blocks',
    name: 'Falling Blocks',
    widget: 'FallingBlocks',
    category: 'Arcade',
    color: '#e2c679',
    description:
      'Rotate falling pieces, clear lines and keep the stack under control.',
    icon: 'blocks',
  },
  {
    id: 'paddle',
    name: 'Brick Breaker',
    widget: 'BrickBreaker',
    category: 'Arcade',
    color: '#b2c9dd',
    description:
      'Work the paddle through four rounds of bricks. Three lives to clear them.',
    icon: 'paddle',
  },
  {
    id: 'merge',
    name: 'Merge 2048',
    widget: 'Merge2048',
    category: 'Puzzle',
    color: '#edbb80',
    description:
      'Slide matching numbers together. Undo a mistake or pick up a saved grid.',
    icon: 'merge',
  },
  {
    id: 'mines',
    name: 'Minefield',
    widget: 'Minefield',
    category: 'Puzzle',
    color: '#db9b8c',
    description:
      'Read the clues and flag the mines. Your first reveal is always safe.',
    icon: 'mines',
  },
  {
    id: 'pairs',
    name: 'Memory Pairs',
    widget: 'MemoryPairs',
    category: 'Puzzle',
    color: '#c8b6ce',
    description: 'Find eight matching pairs in as few turns as possible.',
    icon: 'pairs',
  },
  {
    id: 'focus',
    name: 'Focus',
    widget: 'FrameFocus',
    category: 'Tools',
    color: '#baca9b',
    description:
      'Put a work timer on the wall, then take a break. Your session count stays here.',
    icon: 'focus',
  },
  {
    id: 'breathe',
    name: 'Breathe',
    widget: 'FrameBreathe',
    category: 'Ambient',
    color: '#a9cbb6',
    description:
      'Follow a slow breathing rhythm with a choice of pace and session length.',
    icon: 'breathe',
  },
  {
    id: 'soundscape',
    name: 'Soundscape',
    widget: 'Soundscape',
    category: 'Ambient',
    color: '#d5ad80',
    description:
      'Mix rain, brown noise and ocean sounds, generated right on the TV.',
    icon: 'soundscape',
  },
  {
    id: 'clocks',
    name: 'World Clocks',
    widget: 'WorldClocks',
    category: 'Tools',
    color: '#d6c8a0',
    description:
      'Keep track of your favourite places, including date changes and daylight saving.',
    icon: 'clocks',
  },
  {
    id: 'pixel',
    name: 'Pixel Studio',
    widget: 'PixelStudio',
    category: 'Creative',
    color: '#dcab9b',
    description:
      'Draw with the remote, choose a colour, undo and save your picture.',
    icon: 'pixel',
  },
  {
    id: 'life',
    name: 'Life Garden',
    widget: 'LifeGarden',
    category: 'Creative',
    color: '#acbd8e',
    description:
      'Plant a pattern and watch Conway’s Game of Life grow across the screen.',
    icon: 'life',
  },
].map((app, index) => ({
  ...app,
  package: `dmframe${String(index + 1).padStart(3, '0')}`,
  appId: `dmframe${String(index + 1).padStart(3, '0')}.${app.widget}`,
}));

export function selectApps(value = 'all') {
  if (value === 'all') return apps;
  const selected = apps.find((app) => app.id === value);
  if (!selected)
    throw new Error(
      `Unknown app "${value}". Choose all or ${apps.map((app) => app.id).join(', ')}.`,
    );
  return [selected];
}
