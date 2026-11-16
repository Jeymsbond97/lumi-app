import {
  emitDriveStop,
  fingerOf,
  IDLE_LOCK_MS,
  LOCKED,
  mayDrive,
  onDriveStop,
  shouldRelock,
  SLIDE_DONE,
  slideFraction,
  slideTo,
  touchEnd,
  touchStart,
  unlockAt,
} from '../driveLock';

describe('driveLock', () => {
  it('starts locked', () => {
    expect(mayDrive(LOCKED)).toBe(false);
    expect(mayDrive(unlockAt(0))).toBe(true);
  });

  it('slide below the end does not unlock', () => {
    expect(slideFraction(80, 100)).toBeLessThan(SLIDE_DONE);
    expect(slideFraction(150, 100)).toBe(1);
    expect(slideFraction(-5, 100)).toBe(0);
    expect(slideFraction(5, 0)).toBe(0);
  });

  it('slides open to the right and shut back to the left', () => {
    // from the left end
    expect(slideTo(false, 0.5)).toBe(false);
    expect(slideTo(false, SLIDE_DONE)).toBe(true);
    // from the right end
    expect(slideTo(true, 0.5)).toBe(true);
    expect(slideTo(true, 1 - SLIDE_DONE)).toBe(false);
  });

  it('stays open until the tablet sits untouched for 5 minutes', () => {
    expect(IDLE_LOCK_MS).toBe(5 * 60 * 1000);
    const s = unlockAt(0);
    expect(shouldRelock(s, 0, IDLE_LOCK_MS - 1)).toBe(false);
    expect(shouldRelock(s, 0, IDLE_LOCK_MS)).toBe(true);
    // a touch anywhere on the screen at 4 min starts the 5 minutes again
    expect(shouldRelock(s, 240000, IDLE_LOCK_MS + 1000)).toBe(false);
    expect(shouldRelock(s, 240000, 240000 + IDLE_LOCK_MS)).toBe(true);
    expect(shouldRelock(LOCKED, 0, 10 * IDLE_LOCK_MS)).toBe(false);
  });

  it('stays unlocked while touching', () => {
    expect(shouldRelock(touchStart(unlockAt(0)), 0, 10 * IDLE_LOCK_MS)).toBe(false);
    expect(mayDrive(touchEnd(touchStart(unlockAt(0)), 5))).toBe(true);
  });

  it('stop signal reaches listeners', () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = onDriveStop(a);
    const offB = onDriveStop(b);
    emitDriveStop();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    emitDriveStop();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
  });

  it('follows only the finger that started the drive', () => {
    const touches = [
      { identifier: 1, pageX: 10, pageY: 20 },
      { identifier: 2, pageX: 300, pageY: 400 },
    ];
    expect(fingerOf(touches, 1)).toEqual({ pageX: 10, pageY: 20 });
    expect(fingerOf(touches, 2)).toEqual({ pageX: 300, pageY: 400 });
    expect(fingerOf(touches, 3)).toBeNull();
  });
});
