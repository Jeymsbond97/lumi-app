import { armPowered, armSetupLayout, armWhy, splitPoses, nextPoseName, sortPoses, toGripperState, toPoseNames, validPoseName } from '../arm';

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

describe('saving a pose', () => {
  it('takes 1 to 24 letters, digits, _ and -, around spaces trimmed', () => {
    expect(validPoseName('my_pose')).toBe(true);
    expect(validPoseName('  shelf-2 ')).toBe(true);
    expect(validPoseName('a')).toBe(true);
    expect(validPoseName('x'.repeat(24))).toBe(true);
  });

  it('refuses an empty, a long or an odd name', () => {
    expect(validPoseName('')).toBe(false);
    expect(validPoseName('   ')).toBe(false);
    expect(validPoseName('x'.repeat(25))).toBe(false);
    expect(validPoseName('my pose')).toBe(false);
    expect(validPoseName('pose.1')).toBe(false);
    expect(validPoseName('자세')).toBe(false);
    expect(validPoseName('a/b')).toBe(false);
  });

  it('suggests the first free pose_N', () => {
    expect(nextPoseName([])).toBe('pose_1');
    expect(nextPoseName(['look', 'pose_1', 'pose_3'])).toBe('pose_2');
  });
});

describe('arm setup', () => {
  it('has power when disabled or enabled, not when off, in free drive or in a fault', () => {
    expect(armPowered('enabled')).toBe(true);
    expect(armPowered('disabled')).toBe(true);
    expect(armPowered('off')).toBe(false);
    expect(armPowered('drag')).toBe(false);
    expect(armPowered('error')).toBe(false);
  });

  it('says why a dimmed control cannot act', () => {
    expect(armWhy('disabled')).toBe('driveEnableArmFirst');
    expect(armWhy('enabled')).toBe('driveEnableArmFirst');
    expect(armWhy('off')).toBe('armOff');
    expect(armWhy('error')).toBe('armOff');
  });

  it('is laid out as Cobo π on a tablet, and as 3D, tabs and speed on a phone on its side', () => {
    // Commands' free width: about 880 on a 1280 x 800 tablet (text 17), about 430 on an 844 x 390 phone (text 13)
    const tablet = armSetupLayout(880, 17, 10);
    expect(tablet).toEqual({ kind: 'wide', left: 580, right: 290 });
    const phone = armSetupLayout(430, 13, 8);
    expect(phone).toEqual({ kind: 'compact', scene: 172, fader: 57, controls: 185 });
    if (phone.kind === 'compact') expect(phone.scene + phone.controls + phone.fader + 2 * 8).toBeLessThanOrEqual(430);
    // a tablet with the task card open is narrower: compact too
    expect(armSetupLayout(646, 17, 10).kind).toBe('compact');
  });

  it('lists the saved poses first and apart from Lumi\'s own', () => {
    expect(splitPoses(['look', 'ready', 'cup', 'shelf'], ['shelf', 'cup'])).toEqual({ saved: ['cup', 'shelf'], builtIn: ['look', 'ready'] });
    // a robot that cannot say which were saved: none can be deleted
    expect(splitPoses(['look', 'cup'], null)).toEqual({ saved: [], builtIn: ['look', 'cup'] });
  });
});
