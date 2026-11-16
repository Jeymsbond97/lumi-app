// The joystick's lock: a stray touch must not drive Lumi. The slider under the pad opens it (slid to the right) and
// shuts it (slid back to the left). It also locks when nobody has touched the tablet for 5 minutes (never while a
// finger is on the pad), on STOP, and when the app leaves the foreground.

/** Locks after the tablet's screen sat untouched this long. */
export const IDLE_LOCK_MS = 5 * 60 * 1000;
/** Share of the slider's travel that counts as slid to the end (and 1 minus it, back to the start). */
export const SLIDE_DONE = 0.95;

export interface DriveLock {
  unlocked: boolean;
  /** A finger is on the pad. */
  touching: boolean;
  /** When it was unlocked or the pad was last let go, ms. */
  since: number;
}

export const LOCKED: DriveLock = { unlocked: false, touching: false, since: 0 };

export const unlockAt = (now: number): DriveLock => ({ unlocked: true, touching: false, since: now });
export const touchStart = (s: DriveLock): DriveLock => ({ ...s, touching: true });
export const touchEnd = (s: DriveLock, now: number): DriveLock => ({ ...s, touching: false, since: now });
export const mayDrive = (s: DriveLock): boolean => s.unlocked;

/** lastTouch: the last touch anywhere on the screen, ms. */
export const shouldRelock = (s: DriveLock, lastTouch: number, now: number): boolean =>
  s.unlocked && !s.touching && now - Math.max(s.since, lastTouch) >= IDLE_LOCK_MS;

/** Open or shut after the slider's thumb reached fraction f of its travel: open near the right end, shut near the left. */
export function slideTo(unlocked: boolean, f: number): boolean {
  if (!unlocked && f >= SLIDE_DONE) return true;
  if (unlocked && f <= 1 - SLIDE_DONE) return false;
  return unlocked;
}

// the last touch anywhere on the robot screens, kept by their layout
let lastTouch = 0;
export const noteTouch = (now: number): void => {
  lastTouch = now;
};
export const lastTouchAt = (): number => lastTouch;

/** How far the slider's thumb is along its travel, 0 to 1. */
export function slideFraction(dx: number, travel: number): number {
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, dx / travel));
}

/** The finger that started the drive, out of all fingers on the screen; null once it is gone. */
export function fingerOf(
  touches: readonly { identifier: number; pageX: number; pageY: number }[],
  id: number,
): { pageX: number; pageY: number } | null {
  const f = touches.find((t) => t.identifier === id);
  return f ? { pageX: f.pageX, pageY: f.pageY } : null;
}

// STOP tells the joystick to lock; the two buttons are separate components.
const stopListeners = new Set<() => void>();

export function onDriveStop(fn: () => void): () => void {
  stopListeners.add(fn);
  return () => {
    stopListeners.delete(fn);
  };
}

export function emitDriveStop(): void {
  for (const fn of [...stopListeners]) fn();
}
