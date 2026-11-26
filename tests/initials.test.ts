import { describe, expect, it } from 'vitest';
import { feedName, Initials, LETTERS, NAME_LENGTH } from '../src/initials';

describe('a name of up to seven letters, given as on the machines of old', () => {
  it('starts from the last name given, or from a single A', () => {
    expect(NAME_LENGTH).toBe(7);
    expect(new Initials('').text).toBe('A');
    expect(new Initials('RENAUD').text).toBe('RENAUD');
    expect(new Initials('r#w').text).toBe('R W');             // what the font cannot write becomes a blank
    expect(new Initials('').at).toBe(0);
  });

  it('turns the letter under the cursor up and down, round its letters', () => {
    const i = new Initials('');
    i.down();
    expect(i.shown[0]).toBe(LETTERS[LETTERS.length - 1]);
    i.up(); i.up();
    expect(i.text).toBe('B');
  });

  it('moves on at each confirmation, and is done after the last letter', () => {
    const i = new Initials('');
    for (let k = 0; k < NAME_LENGTH - 1; k++) { i.confirm(); expect(i.done).toBe(false); }
    expect(i.at).toBe(NAME_LENGTH - 1);
    i.confirm();
    expect(i.done).toBe(true);
  });

  it('can be finished early, its blanks at the end left out', () => {
    const i = new Initials('');
    i.type('l'); i.type('E'); i.type('o');
    expect(i.done).toBe(false);
    i.finish();
    expect(i.done).toBe(true);
    expect(i.text).toBe('LEO');
  });

  it('takes letters typed on the keyboard, and rubs the last out', () => {
    const i = new Initials('');
    for (const k of 'Renaud') i.type(k);
    expect(i.text).toBe('RENAUD');
    i.rubOut();
    expect(i.text).toBe('RENAU');
    expect(i.at).toBe(5);
    expect(i.type('#')).toBe(false);                         // not a letter it knows
  });

  it('is never written empty', () => {
    const i = new Initials('');
    i.rubOut(); i.finish();
    expect(i.text).toBe('???');
  });

  it('changes nothing once done', () => {
    const i = new Initials('XYZ');
    i.finish();
    i.up(); i.type('A'); i.back(); i.rubOut();
    expect(i.text).toBe('XYZ');
    expect(i.done).toBe(true);
  });
});

describe('the keys and buttons that give a name', () => {
  const noPad = { up: false, down: false, left: false, right: false, confirm: false, back: false, finish: false };
  it('take the keyboard as it types, with Backspace and Enter', () => {
    const i = new Initials('');
    feedName(i, ['l', 'e', 'o', 'x', 'Backspace', 'Enter'], noPad);
    expect(i.done).toBe(true);
    expect(i.text).toBe('LEO');
  });
  it('take the arrows and the space as the machines did', () => {
    const i = new Initials('');
    feedName(i, ['ArrowUp', ' ', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter'], noPad);
    expect(i.text).toBe('BC');
  });
  it('take the gamepad: up and down, A to go on, B to go back, Start to end', () => {
    const i = new Initials('');
    feedName(i, [], { ...noPad, up: true });
    feedName(i, [], { ...noPad, confirm: true });
    feedName(i, [], { ...noPad, up: true });
    feedName(i, [], { ...noPad, finish: true });
    expect(i.text).toBe('BA');                               // a blank turned up once is an A
  });
});
