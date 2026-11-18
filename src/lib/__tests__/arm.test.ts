import { sortPoses, toGripperState, toPoseNames } from '../arm';

describe('arm poses', () => {
  it('lists the taught poses, the usual ones first, then by name', () => {
    const raw = { wave: [0, 0, 0, 0, 0, 0], zeta: [0], look: [1], alpha: [2], rest: [3], broken: 'x' };
    expect(toPoseNames(raw)).toEqual(['look', 'rest', 'wave', 'alpha', 'zeta']);
  });

  it('a reply of another shape gives no poses', () => {
    expect(toPoseNames(null)).toEqual([]);
    expect(toPoseNames([1, 2])).toEqual([]);
    expect(toPoseNames({ error: 'arm offline' })).toEqual([]);
  });

  it('sorts without changing its input', () => {
    const names = ['b', 'ready', 'a', 'look'];
    expect(sortPoses(names)).toEqual(['look', 'ready', 'a', 'b']);
    expect(names).toEqual(['b', 'ready', 'a', 'look']);
  });
});

describe('gripper state', () => {
  it('reads open, closed and holding', () => {
    expect(toGripperState({ closed: false, holding: false })).toBe('open');
    expect(toGripperState({ closed: true, holding: false })).toBe('closed');
    expect(toGripperState({ closed: true, holding: true })).toBe('holding');
  });

  it('is unknown when the arm does not say', () => {
    expect(toGripperState({ error: 'no tool I/O' })).toBeNull();
    expect(toGripperState({})).toBeNull();
  });
});
