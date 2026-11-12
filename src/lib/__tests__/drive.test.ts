import { clampToPad, padToJog } from '../drive';

describe('padToJog', () => {
  it('does nothing while the thumb rests near the centre', () => {
    expect(padToJog(5, -5, 100)).toEqual([]);
  });

  it('drives forward when pushed up, at full speed on the rim', () => {
    expect(padToJog(0, -100, 100)).toEqual([{ axis: 'base_drive', direction: 1, speed: 1 }]);
  });

  it('drives backward when pulled down', () => {
    expect(padToJog(0, 60, 100)).toEqual([{ axis: 'base_drive', direction: -1, speed: 0.55 }]);
  });

  it('turns right when pushed right and left when pushed left (positive base_turn is right on Lumi)', () => {
    expect(padToJog(100, 0, 100)).toEqual([{ axis: 'base_turn', direction: 1, speed: 1 }]);
    expect(padToJog(-100, 0, 100)).toEqual([{ axis: 'base_turn', direction: -1, speed: 1 }]);
  });

  it('drives and turns on a diagonal', () => {
    const cmds = padToJog(50, -50, 100);
    expect(cmds.map((c) => [c.axis, c.direction])).toEqual([
      ['base_drive', 1],
      ['base_turn', 1],
    ]);
  });

  it('never goes past full speed when the finger leaves the pad', () => {
    expect(padToJog(0, -400, 100)).toEqual([{ axis: 'base_drive', direction: 1, speed: 1 }]);
  });
});

describe('clampToPad', () => {
  it('keeps the knob on the rim when the finger goes past it', () => {
    expect(clampToPad(300, 400, 100)).toEqual({ x: 60, y: 80 });
    expect(clampToPad(30, 40, 100)).toEqual({ x: 30, y: 40 });
  });
});
