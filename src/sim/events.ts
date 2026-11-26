// What the simulation tells the outside world. It never draws or plays a sound itself.

export type SoundName = 'jump' | 'land' | 'swing' | 'hit' | 'hurt' | 'ember' | 'door' | 'ko' | 'win' | 'daze' | 'finish' | 'block' | 'charge' | 'empty' | 'thunder'
  | 'bell' | 'roar' | 'breath' | 'slam' | 'bones' | 'flare' | 'growl' | 'bark' | 'shriek' | 'crash' | 'splash' | 'grave' | 'caw' | 'grab' | 'reaper'
  | 'wade' | 'drip' | 'bubble' | 'gurgle';

export type GameEvent =
  | { type: 'effect'; kind: string; x: number; y: number; flip: boolean }   // a one-shot effect with its origin on (x, y)
  | { type: 'sound'; name: SoundName }
  | { type: 'dust'; x: number; y: number; count: number }
  | { type: 'flame'; x: number; y: number; dir: 1 | -1 }                      // the trail of a flaming charge
  | { type: 'finisher'; x: number; y: number }                               // a dazed foe has just been ended, here
  | { type: 'toll' }                                                          // the great bell has just been struck
  | { type: 'lightning' }                                                     // a strike of the storm, now
  | { type: 'splash'; x: number; y: number; size: number }                    // water thrown up, at its surface (1 a step, 2 a fall)
  | { type: 'debris'; x: number; y: number; count: number }                   // stone breaking, here
  | { type: 'blood'; x: number; y: number; dir: 1 | -1; amount: number; chunks: number };    // drops thrown the way of a blow, and heavier pieces

export type Emit = (event: GameEvent) => void;
