// What the base's own web page (:9001) shows in its top bar, as the Map screen's VIEW and BASE lists and the E-STOP
// button read it: the base's state from /status, its sensors (/agv/sensors), the path it plans (/agv/plan) and
// where Lumi drove (a trail kept by the app). See docs/MAP.md "Base and view".
import type { TextKey } from './i18n';

// ---------- the base's state (/status base: lumi-wave api/server.py status(), the base's robot_status) ----------
export interface RawBase {
  move_status?: string;
  move_target?: string;
  running_status?: string;
  error_code?: string;
  estop_state?: boolean;
  soft_estop_state?: boolean;
  hard_estop_state?: boolean;
  is_paused?: boolean;
  error?: string;
}

export interface BaseState {
  /** idle, running, succeeded, failed or canceled (the base's move_status); '' when it does not say. */
  move: string;
  /** What the base does in a drive (leave_charging_pile, dock_to_charging_pile, ...); 'idle' between drives. */
  running: string;
  /** The marker it drives to; '' for a point or none. */
  target: string;
  /** The base's fault code, null when there is none ("00000000"). */
  errorCode: string | null;
  /** The soft E-stop (E-STOP in the app, the base page's soft E-stop): the drive waits until it is released. */
  softEstop: boolean;
  /** The red button on Lumi: only a hand on the robot releases it. */
  hardEstop: boolean;
  /** The base's own "paused" (shown on its page next to the state). */
  paused: boolean;
}

const NO_FAULT = '00000000';

/**
 * The base part of /status, or null when the base does not answer. An API older than the E-STOP endpoint sends only
 * estop_state (soft or hard): it counts as the soft one then, so E-STOP still shows that the base is held.
 */
export function toBaseState(raw: RawBase | undefined): BaseState | null {
  if (!raw || raw.error) return null;
  const split = typeof raw.soft_estop_state === 'boolean' || typeof raw.hard_estop_state === 'boolean';
  const hard = raw.hard_estop_state === true;
  const code = typeof raw.error_code === 'string' ? raw.error_code : '';
  return {
    move: raw.move_status ?? '',
    running: raw.running_status ?? 'idle',
    target: raw.move_target ?? '',
    errorCode: code && code !== NO_FAULT ? code : null,
    softEstop: split ? raw.soft_estop_state === true : raw.estop_state === true && !hard,
    hardEstop: hard,
    paused: raw.is_paused === true,
  };
}

/** A drive is going on (or held by E-STOP: the base keeps it "running" until it goes on). */
export const driving = (b: BaseState | null): boolean => !!b && b.move === 'running';

const RUNNING_TEXT: Record<string, TextKey> = {
  leave_charging_pile: 'baseLeavingCharger',
  dock_to_charging_pile: 'baseDocking',
};
const MOVE_TEXT: Record<string, TextKey> = {
  idle: 'baseIdle',
  running: 'baseDriving',
  succeeded: 'baseArrived',
  failed: 'baseFailed',
  canceled: 'baseCancelled',
};

/** The base's state in words: held, docking, driving, arrived, ... */
export function baseText(b: BaseState): TextKey {
  if (b.hardEstop) return 'baseHardEstop';
  if (b.softEstop) return 'baseHeld';
  if (b.paused) return 'basePaused';
  return RUNNING_TEXT[b.running] ?? MOVE_TEXT[b.move] ?? 'baseIdle';
}

// ---------- E-STOP ----------
export type EstopLook = 'ready' | 'held' | 'hard';

/** How the E-STOP button looks: `want` is what was just pressed, until the base says the same (about a second). */
export function estopLook(b: BaseState | null, want: boolean | null): EstopLook {
  if (b?.hardEstop) return 'hard';
  const held = want ?? b?.softEstop ?? false;
  return held ? 'held' : 'ready';
}

/** E-STOP shows on the Map always, elsewhere while Lumi drives or is held (so it can always be released). */
export const estopShown = (onMap: boolean, b: BaseState | null): boolean =>
  onMap || driving(b) || !!b?.softEstop || !!b?.hardEstop;

// ---------- sensors (proposed lumi-wave GET /agv/sensors, from the base's rosbridge) ----------
export interface RawSensors {
  linear?: number | null;
  angular?: number | null;
  ultrasonic?: Record<string, number | null>;
  infrared?: Record<string, number | null>;
}

export interface Range {
  /** The base's name for it: l1, m, r1, b, ... */
  name: string;
  /** Metres to what it sees; null when nothing is in range. */
  m: number | null;
}

export interface Sensors {
  /** m/s forward, null when the base does not say. */
  linear: number | null;
  /** rad/s, + to the left. */
  angular: number | null;
  ultrasonic: Range[];
  infrared: Range[];
}

/** Closer than this is drawn red, as on the base's page. */
export const NEAR_M = 1;

const ORDER = ['l4', 'l3', 'l2', 'l1', 'm', 'r1', 'r2', 'r3', 'r4', 'b'];
const rank = (n: string) => {
  const i = ORDER.indexOf(n);
  return i < 0 ? ORDER.length : i;
};
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function toRanges(raw: Record<string, number | null> | undefined): Range[] {
  return Object.entries(raw ?? {})
    .map(([name, v]) => ({ name, m: fin(v) && v > 0.001 ? v : null }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

export function toSensors(raw: RawSensors): Sensors {
  return {
    linear: fin(raw.linear) ? raw.linear : null,
    angular: fin(raw.angular) ? raw.angular : null,
    ultrasonic: toRanges(raw.ultrasonic),
    infrared: toRanges(raw.infrared),
  };
}

/** A sensor's name in words: l1 -> left 1, m -> front, r2 -> right 2, b -> back; others as the base names them. */
export function sensorName(name: string): { side: TextKey | null; n: string } {
  if (name === 'm') return { side: 'sensorFront', n: '' };
  if (name === 'b') return { side: 'sensorBack', n: '' };
  const m = /^([lr])(\d)$/.exec(name);
  if (m) return { side: m[1] === 'l' ? 'sensorLeft' : 'sensorRight', n: m[2] };
  return { side: null, n: name };
}

export const rangeText = (m: number) => `${m.toFixed(2)} m`;
export const speedText = (v: number) => `${v.toFixed(2)} m/s`;
export const turnText = (w: number) => `${Math.round((w * 180) / Math.PI)} °/s`;

// ---------- the planned path (proposed lumi-wave GET /agv/plan) ----------
export function toPlan(raw: { points?: unknown }): { x: number; y: number }[] {
  if (!Array.isArray(raw.points)) return [];
  return raw.points.flatMap((p) => (Array.isArray(p) && fin(p[0]) && fin(p[1]) ? [{ x: p[0], y: p[1] }] : []));
}

// ---------- the trail: where Lumi drove (kept by the app from /status) ----------
export type Trail = { x: number; y: number }[][];

/** A new point only this far from the last one (m), so standing still adds nothing. */
export const TRAIL_STEP_M = 0.05;
/** A jump this long is no drive but a new position (set on the map, or the base found itself): a new piece starts. */
export const TRAIL_JUMP_M = 1.5;
/** The points kept in all; the oldest go first. */
export const TRAIL_MAX = 1500;

/** The trail with Lumi's pose now added (the same trail when Lumi has not moved far enough). */
export function addToTrail(trail: Trail, p: { x: number; y: number }): Trail {
  const piece = trail[trail.length - 1];
  const last = piece?.[piece.length - 1];
  const d = last ? Math.hypot(p.x - last.x, p.y - last.y) : Infinity;
  if (last && d < TRAIL_STEP_M) return trail;
  const next = !last || d > TRAIL_JUMP_M ? [...trail, [{ x: p.x, y: p.y }]] : [...trail.slice(0, -1), [...piece, { x: p.x, y: p.y }]];
  let over = next.reduce((n, s) => n + s.length, 0) - TRAIL_MAX;
  while (over > 0 && next.length) {
    const first = next[0];
    if (first.length <= over) {
      over -= first.length;
      next.shift();
    } else {
      next[0] = first.slice(over);
      over = 0;
    }
  }
  return next;
}

/** Points of the trail in all. */
export const trailLength = (t: Trail): number => t.reduce((n, s) => n + s.length, 0);

// ---------- the base's settings (lumi-wave GET /agv/settings: four of the base page's "configuration") ----------
export const SETTING_NAMES = ['max_speed_linear', 'max_speed_angular', 'pose_tolerance', 'theta_tolerance'] as const;
export type SettingName = (typeof SETTING_NAMES)[number];

export interface BaseSetting {
  name: SettingName;
  /** What the base has now; null when it did not say. */
  value: number | null;
  min: number;
  max: number;
  /** The base page's default. */
  def: number;
}

export const SETTING_TEXT: Record<SettingName, TextKey> = {
  max_speed_linear: 'settingSpeed',
  max_speed_angular: 'settingTurn',
  pose_tolerance: 'settingPlace',
  theta_tolerance: 'settingAngle',
};
export const SETTING_UNIT: Record<SettingName, string> = {
  max_speed_linear: 'm/s',
  max_speed_angular: 'rad/s',
  pose_tolerance: 'm',
  theta_tolerance: 'rad',
};
/** One tap of - or + changes a setting by this much. */
export const SETTING_STEP: Record<SettingName, number> = {
  max_speed_linear: 0.1,
  max_speed_angular: 0.1,
  pose_tolerance: 0.05,
  theta_tolerance: 0.05,
};

/** The settings the robot sent, in SETTING_NAMES order; unknown names and broken rows are left out. */
export function toBaseSettings(raw: { settings?: unknown }): BaseSetting[] {
  const rows = Array.isArray(raw.settings) ? (raw.settings as Record<string, unknown>[]) : [];
  return SETTING_NAMES.flatMap((name) => {
    const r = rows.find((x) => x && x.name === name);
    if (!r || !fin(r.min) || !fin(r.max) || !fin(r.default)) return [];
    return [{ name, value: fin(r.value) ? r.value : null, min: r.min, max: r.max, def: r.default }];
  });
}

/** `value` moved by `dir` taps of the setting's step, kept in its range (two decimals). */
export function stepSetting(s: BaseSetting, value: number, dir: 1 | -1): number {
  const next = Math.round((value + dir * SETTING_STEP[s.name]) * 100) / 100;
  return Math.min(s.max, Math.max(s.min, next));
}

export const settingText = (name: SettingName, v: number) => `${v.toFixed(2)} ${SETTING_UNIT[name]}`;
