import { keepLast, KEEP_MS } from '../stale';

describe('keepLast', () => {
  it('shows a good reading at once', () => {
    expect(keepLast(null, 5, 100)).toEqual({ value: 5, at: 100 });
    expect(keepLast({ value: 4, at: 0 }, 5, 100)).toEqual({ value: 5, at: 100 });
  });

  it('keeps the last good value through a short gap, and drops it after KEEP_MS', () => {
    const last = { value: 4, at: 1000 };
    expect(keepLast(last, null, 1000 + 500)).toBe(last);
    expect(keepLast(last, null, 1000 + KEEP_MS - 1)).toBe(last);
    expect(keepLast(last, null, 1000 + KEEP_MS)).toBeNull();
    expect(keepLast(null, null, 0)).toBeNull();
  });
});
