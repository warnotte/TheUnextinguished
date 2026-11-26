// Ash instead of blood, for the younger players: a blow throws grey flakes the way it was struck,
// which the air slows and lets down slowly, and a few embers that rise and go out. Nothing stays.

export interface AshBit { x: number; y: number; vx: number; vy: number; life: number; color: string; g: number; drag: number }

const GREYS = ['#2c2a30', '#46434b', '#625e68', '#8a8590', '#b3aeb8'];
const EMBERS = ['#ffd27a', '#ffb347', '#ff9a3c'];

/** What a blow throws instead of `amount` of blood at (x, y), struck the way `dir` says. */
export function ashFrom(x: number, y: number, dir: number, amount: number, random: () => number): AshBit[] {
  const bits: AshBit[] = [];
  const flakes = 3 + Math.round(Math.min(amount, 160) * 0.3);
  for (let i = 0; i < flakes; i++) {
    bits.push({
      x: x + (random() - 0.5) * 8, y: y + (random() - 0.5) * 10,
      vx: dir * (20 + random() * 110) + (random() - 0.5) * 40, vy: -(30 + random() * 120),
      life: 0.9 + random() * 1.2, color: GREYS[Math.floor(random() * GREYS.length)],
      g: 30 + random() * 60, drag: 1.5 + random() * 1.5,
    });
  }
  const embers = amount >= 20 ? 1 + Math.round(Math.min(amount, 160) * 0.05) : 0;
  for (let i = 0; i < embers; i++) {
    bits.push({
      x: x + (random() - 0.5) * 6, y: y + (random() - 0.5) * 8,
      vx: dir * (10 + random() * 60), vy: -(40 + random() * 90),
      life: 0.4 + random() * 0.6, color: EMBERS[Math.floor(random() * EMBERS.length)],
      g: -(40 + random() * 60), drag: 1,
    });
  }
  return bits;
}
