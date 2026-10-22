export const ARCHETYPES = [
  { id: 'echo', name: 'Echo bloom', description: 'Quiet beginnings. Stronger in connected cities.', spread: 1.15, stealth: 1.3, drift: 0.8 },
  { id: 'glass', name: 'Glass fever', description: 'Fragile, fast, and difficult to hide.', spread: 1.4, stealth: 0.7, drift: 1 },
  { id: 'morrow', name: 'Morrow spore', description: 'Slow to establish. Built to endure.', spread: 0.85, stealth: 1.1, drift: 1.2 },
  { id: 'velvet', name: 'Velvet static', description: 'A subtle strain with frequent surprises.', spread: 1, stealth: 1.5, drift: 1.5 },
  { id: 'ember', name: 'Ember swarm', description: 'Thrives in warmth; struggles in the cold.', spread: 1.2, stealth: 0.9, drift: 1.1, warm: 0.4 },
  { id: 'rime', name: 'Rime lattice', description: 'An unlikely foothold in colder regions.', spread: 1, stealth: 1.2, drift: 1, cold: 0.5 },
  { id: 'prism', name: 'Prism haze', description: 'Unstable, adaptable, expensive to control.', spread: 1.05, stealth: 1, drift: 2 },
  { id: 'umbra', name: 'Umbra chorus', description: 'Patient growth with a powerful late game.', spread: 0.95, stealth: 1.4, drift: 0.6 },
];
export const GENOMES = [
  { id: 'balanced', name: 'Balanced', description: 'No starting modifiers.', modifiers: {} },
  { id: 'nomad', name: 'Nomad', description: 'More travel, slower local growth.', modifiers: { travel: 0.7, spread: -0.2 } },
  { id: 'ghost', name: 'Ghost', description: 'Less awareness, fewer spontaneous mutations.', modifiers: { stealth: 0.7, drift: -0.3 } },
  { id: 'armour', name: 'Armoured', description: 'Research resistance at the cost of travel.', modifiers: { resist: 0.6, travel: -0.3 } },
  { id: 'wild', name: 'Wild', description: 'Frequent mutations, less concealment.', modifiers: { drift: 1.2, stealth: -0.3 } },
];

const branches = [
  ['reach', 'Reach', 'spread', ['Signal bloom', 'Thread network', 'Echo chamber', 'Resonant field', 'Cascade', 'Horizon pulse'], 'Increases local spread.', 0.16],
  ['travel', 'Migration', 'travel', ['Drifting motes', 'Wayfinder', 'Long wave', 'Crosscurrent', 'Open circuit', 'World chorus'], 'Improves passage between regions.', 0.2],
  ['veil', 'Concealment', 'stealth', ['Soft edges', 'Quiet phase', 'Mirror shell', 'False dawn', 'Ghost pattern', 'Silent orbit'], 'Delays global awareness.', 0.17],
  ['resist', 'Resilience', 'resist', ['Anchor', 'Layered shell', 'Deep roots', 'Memory mesh', 'Redundancy', 'Last light'], 'Slows the research response.', 0.18],
  ['cold', 'Cold adaptation', 'cold', ['Frost thread', 'Winter bloom', 'Polar lens', 'Ice memory', 'Rime bridge', 'White horizon'], 'Strengthens spread in cold regions.', 0.22],
  ['warm', 'Heat adaptation', 'warm', ['Sun thread', 'Amber skin', 'Desert song', 'Heat mirror', 'Solar fold', 'Burning horizon'], 'Strengthens spread in warm regions.', 0.22],
  ['impact', 'Disruption', 'impact', ['Restless nights', 'Heavy air', 'Faded colours', 'Static dreams', 'Lost rhythm', 'Long eclipse'], 'Increases mortality and public awareness.', 0.2],
  ['drift', 'Instability', 'drift', ['Split pattern', 'Wild branch', 'Unwritten code', 'Shifting form', 'Fractal echo', 'Infinite garden'], 'Encourages spontaneous trait changes.', 0.25],
];
export const BRANCHES = branches.map(([id, name]) => ({ id, name }));
export const TRAITS = branches.flatMap(([branch, , stat, names, description, value]) => names.map((name, tier) => ({
  id: `${branch}-${tier}`, name, branch, stat, description, value, tier, cost: 5 + tier * 4, max: 3,
  requires: tier ? `${branch}-${tier - 1}` : null,
})));
export const SCENARIOS = [
  { id: 'frontier', name: 'Open frontier', description: 'Reach 75% global infection before the response catches you.', target: 0.75, research: 1 },
  { id: 'silent', name: 'The quiet world', description: 'Reach 50% infection. Awareness above 65% ends the run.', target: 0.5, research: 0.8, awarenessLimit: 65 },
  { id: 'race', name: 'Against the clock', description: 'Reach 60% infection within 240 days. Research moves faster.', target: 0.6, research: 1.4, deadline: 240 },
  { id: 'endurance', name: 'Long winter', description: 'A colder world. Reach 85% infection against a patient response.', target: 0.85, research: 0.65, temperature: -20 },
  { id: 'sandbox', name: 'Sandbox', description: 'Unlimited evolution points, no defeat, and a world to experiment with.', target: 1, research: 0 },
];
export const EVENTS = [
  ['festival', 'Midnight festival draws record crowds', 'travel', 1.8, 16],
  ['storm', 'Storm system interrupts regional travel', 'travel', 0.4, 12],
  ['breakthrough', 'Research consortium shares a new model', 'research', 1.7, 14],
  ['blackout', 'Rolling blackouts interrupt research', 'research', 0.45, 10],
  ['heatwave', 'Unseasonal heat settles over the region', 'warm', 0.8, 20],
  ['coldfront', 'Cold front arrives weeks ahead of forecasts', 'cold', 0.8, 20],
  ['rumour', 'An unexplained pattern catches public attention', 'awareness', 1.8, 8],
  ['distraction', 'A celestial spectacle dominates the headlines', 'awareness', 0.4, 12],
  ['rail', 'New rail corridor opens across the region', 'travel', 1.6, 25],
  ['strike', 'Transport strike leaves terminals quiet', 'travel', 0.6, 14],
  ['exchange', 'International exchange programme expands', 'travel', 1.5, 18],
  ['funding', 'Emergency research funding approved', 'research', 1.5, 22],
  ['audit', 'Independent audit delays a research programme', 'research', 0.65, 18],
  ['tourism', 'Tourism rebounds after a quiet season', 'travel', 1.4, 18],
  ['sensors', 'New monitoring network comes online', 'awareness', 1.5, 25],
  ['fog', 'Dense fog grounds regional flights', 'travel', 0.5, 9],
  ['summit', 'World summit accelerates scientific cooperation', 'research', 1.4, 12],
  ['migration', 'Seasonal migration reshapes the travel network', 'travel', 1.7, 18],
  ['rain', 'Persistent rain cools the region', 'cold', 0.5, 15],
  ['dry', 'Dry season lasts longer than expected', 'warm', 0.5, 18],
].map(([id, title, stat, value, duration]) => ({ id, title, stat, value, duration }));

export const SYNERGIES = [
  { name: 'Whisper network', needs: ['reach-1', 'veil-1'], stat: 'spread', value: 0.35 },
  { name: 'All-season bloom', needs: ['cold-1', 'warm-1'], stat: 'resist', value: 0.4 },
  { name: 'Nomadic memory', needs: ['travel-2', 'resist-1'], stat: 'travel', value: 0.6 },
  { name: 'Unstable harmony', needs: ['drift-1', 'reach-2'], stat: 'spread', value: 0.5 },
  { name: 'Invisible winter', needs: ['cold-2', 'veil-2'], stat: 'stealth', value: 0.6 },
  { name: 'Amber eclipse', needs: ['warm-2', 'impact-2'], stat: 'impact', value: 0.5 },
];
