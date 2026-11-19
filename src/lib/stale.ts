// The arm controller drops its connection for about half a second every few seconds, so some readings fail. A value
// that was read well stays shown through such a gap and goes away only after KEEP_MS without a good reading.

export const KEEP_MS = 3000;

export interface Kept<T> {
  value: T;
  /** When it was read. */
  at: number;
}

/** The value to show after a reading: a good one (not null) replaces the last; a failed one keeps it for a while. */
export function keepLast<T>(prev: Kept<T> | null, next: T | null, now: number, keepMs = KEEP_MS): Kept<T> | null {
  if (next !== null) return { value: next, at: now };
  if (prev && now - prev.at < keepMs) return prev;
  return null;
}
