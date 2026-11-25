// What the simulation tells the outside world. It never draws or plays a sound itself.

export type SoundName = 'jump' | 'land' | 'swing' | 'hit' | 'hurt' | 'ember' | 'door' | 'ko' | 'win' | 'daze' | 'finish' | 'block' | 'charge' | 'empty';

export type GameEvent =
  | { type: 'effect'; kind: string; x: number; y: number; flip: boolean }   // a one-shot effect with its origin on (x, y)
  | { type: 'sound'; name: SoundName }
  | { type: 'dust'; x: number; y: number; count: number }
  | { type: 'flame'; x: number; y: number; dir: 1 | -1 }                      // the trail of a flaming charge
  | { type: 'finisher'; x: number; y: number }                               // a dazed foe has just been ended, here
  | { type: 'blood'; x: number; y: number; dir: 1 | -1; amount: number; chunks: number };    // drops thrown the way of a blow, and heavier pieces

export type Emit = (event: GameEvent) => void;
