import { steadySize } from '../steadyWindow';

describe('steadySize', () => {
  it('keeps the tallest height at one width (a keyboard brings the navigation bar back)', () => {
    const full = { width: 1502.3, height: 901.4 };
    const kb = steadySize(full, { width: 1502.3, height: 846.6 });
    expect(kb).toEqual(full);
    expect(steadySize(kb, full)).toEqual(full);
  });

  it('starts again at a new width and takes a taller height', () => {
    expect(steadySize({ width: 1502, height: 901 }, { width: 900, height: 1500 })).toEqual({ width: 900, height: 1500 });
    expect(steadySize({ width: 1502, height: 846 }, { width: 1502, height: 901 })).toEqual({ width: 1502, height: 901 });
    expect(steadySize(null, { width: 1, height: 2 })).toEqual({ width: 1, height: 2 });
  });
});
