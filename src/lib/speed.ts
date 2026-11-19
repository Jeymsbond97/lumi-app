// The speed sliders (ui/SpeedSlider.tsx) of Drive and ARM SETUP as plain numbers, in whole percents:
// - ARM: the robot's global arm speed (GET and POST /arm/speed {percent}); every arm motion follows it, so the arm
//   jog sends speed 1 and the robot scales it. Its range comes from the robot's reply.
// - BODY: local only, 5 to 100 %, sent as speed = percent / 100 in /jog.

export interface SpeedRange {
  min: number;
  max: number;
}

/** Used when GET /arm/speed does not say its range. */
export const ARM_SPEED_FALLBACK: SpeedRange = { min: 10, max: 150 };
export const BODY_SPEED_RANGE: SpeedRange = { min: 5, max: 100 };
export const BODY_SPEED_DEFAULT = 50;
/** One tap on minus or plus. */
export const SPEED_STEP = 5;
/** What /jog takes as speed. */
const JOG_MIN = 0.05;
const JOG_MAX = 1;

/** A whole percent inside the range. */
export function clampPercent(v: number, r: SpeedRange): number {
  if (!Number.isFinite(v)) return r.min;
  return Math.min(r.max, Math.max(r.min, Math.round(v)));
}

/** Where a value sits on the track, 0 (left) to 1 (right). */
export function fractionOf(v: number, r: SpeedRange): number {
  if (r.max <= r.min) return 0;
  return (clampPercent(v, r) - r.min) / (r.max - r.min);
}

/** The value under a finger `x` px from the track's left edge. */
export function valueAt(x: number, width: number, r: SpeedRange): number {
  if (!(width > 0)) return r.min;
  const f = Math.min(1, Math.max(0, x / width));
  return clampPercent(r.min + f * (r.max - r.min), r);
}

/** Minus or plus: one step from the value, kept inside the range. */
export const stepPercent = (v: number, by: number, r: SpeedRange): number => clampPercent(v + by, r);

/** The body's percent as /jog's speed. */
export const jogSpeedOf = (percent: number): number => Math.min(JOG_MAX, Math.max(JOG_MIN, percent / 100));

export interface ArmSpeed extends SpeedRange {
  percent: number;
}

/** GET or POST /arm/speed's reply {percent, min, max}; a missing range falls back to 10 to 150; no percent: null. */
export function toArmSpeed(raw: unknown): ArmSpeed | null {
  const o = (raw ?? {}) as { percent?: unknown; min?: unknown; max?: unknown };
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!num(o.percent)) return null;
  const range = num(o.min) && num(o.max) && o.max > o.min ? { min: Math.round(o.min), max: Math.round(o.max) } : ARM_SPEED_FALLBACK;
  return { ...range, percent: clampPercent(o.percent, range) };
}

/** A body speed kept in AsyncStorage; anything else gives null. */
export function toStoredPercent(raw: string | null, r: SpeedRange): number | null {
  if (raw === null || raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? clampPercent(v, r) : null;
}

/** The upright fader: the value after the finger moved `dy` px (down is positive) on a fader `height` px high. */
export function faderValue(start: number, dy: number, height: number, r: SpeedRange): number {
  if (!(height > 0)) return clampPercent(start, r);
  return clampPercent(start - (dy / height) * (r.max - r.min), r);
}

/** Cobo π's speed scale: the ticks sit evenly along the track, and the value runs linearly between two of them. */
export const SPEED_TICKS = [1, 5, 20, 50, 100];

/** The scale's stops inside the range: its ends and the ticks between them, evenly spaced along the track. */
export function tickStops(r: SpeedRange): number[] {
  const inside = SPEED_TICKS.filter((t) => t > r.min && t < r.max);
  return [r.min, ...inside, r.max];
}

/** Where a value sits on the ticked track, 0 (left) to 1 (right). */
export function tickFraction(v: number, r: SpeedRange): number {
  const stops = tickStops(r);
  const x = clampPercent(v, r);
  const n = stops.length - 1;
  if (n <= 0) return 0;
  for (let i = 0; i < n; i++) {
    if (x <= stops[i + 1]) return (i + (x - stops[i]) / (stops[i + 1] - stops[i])) / n;
  }
  return 1;
}

/** The value at a place on the ticked track (0 to 1). */
export function tickValue(f: number, r: SpeedRange): number {
  const stops = tickStops(r);
  const n = stops.length - 1;
  if (n <= 0) return r.min;
  const p = Math.min(1, Math.max(0, f)) * n;
  const i = Math.min(n - 1, Math.floor(p));
  return clampPercent(stops[i] + (p - i) * (stops[i + 1] - stops[i]), r);
}

/** The tick marks to label: Cobo π's 1, 5, 20, 50, 100 that fall inside the range, at their place on the track. */
export function tickLabels(r: SpeedRange): { value: number; at: number }[] {
  return SPEED_TICKS.filter((t) => t >= r.min && t <= r.max).map((value) => ({ value, at: tickFraction(value, r) }));
}
