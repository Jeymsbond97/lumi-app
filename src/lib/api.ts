import { fetchWithTimeout } from './connection';
import type { TextKey } from './i18n';
import type { AxisCommand } from './drive';
import { toMapInfo, type MapInfo } from './mapGeom';
import { toRouteProgress, type RouteProgress } from './route';

// Shapes of lumi-api replies (lumi-wave api/server.py), only the parts the app reads.
// A part that does not answer comes back as { error: "..." } instead.
interface Failed {
  error?: string;
}
interface RawStatus {
  base?: Failed & {
    power_percent?: number;
    charge_state?: boolean;
    move_status?: string;
    current_pose?: { x?: number; y?: number; theta?: number };
  };
  body?: Failed & {
    lift_mm?: number;
    waist_deg?: number;
    head_yaw_deg?: number;
    head_pitch_deg?: number;
    /** All four joints enabled; missing from APIs older than /body/enable. */
    enabled?: boolean;
  };
  arm?: Failed & { power?: boolean; enable?: boolean };
}
interface RawArmState extends Failed {
  joints?: number[];
  power?: boolean;
  enable?: boolean;
}

/** Ring colour on the arm's shoulder, as the JAKA controller shows it. */
export type ArmState = 'off' | 'disabled' | 'enabled' | 'error' | 'drag';

export const ARM_TEXT: Record<ArmState, TextKey> = {
  off: 'armOff',
  disabled: 'armDisabled',
  enabled: 'armEnabled',
  error: 'armError',
  drag: 'armDrag',
};

export interface Body {
  liftMm: number;
  waistDeg: number;
  headYawDeg: number;
  headPitchDeg: number;
  /** null when the robot's API does not say (older than /body/enable). */
  enabled: boolean | null;
}

/**
 * The body's angles can be trusted only while it is enabled: after a controller power cycle the joints are disabled
 * and read values the real robot is not at (head pitch -28°, under its -5° stop, seen 2026-11-13).
 */
export const bodyPoseKnown = (body: Body | null): body is Body => !!body && body.enabled !== false;

export interface RobotStatus {
  battery: number | null;
  charging: boolean;
  status: TextKey;
  /** null when the head and lift controller does not answer. */
  body: Body | null;
  armState: ArmState;
  /** The arm controller did not answer this round (it is busy while it enables, for example); armState says off then. */
  armSilent: boolean;
  /** Where the base is on the current map (m, rad), null when the base does not say. */
  pose: { x: number; y: number; theta: number } | null;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function toStatus(raw: RawStatus): RobotStatus {
  const base = raw.base ?? {};
  const b = raw.body ?? {};
  const arm = raw.arm ?? {};
  const moving = !!base.move_status && base.move_status !== 'idle';
  return {
    battery: num(base.power_percent) ? base.power_percent : null,
    charging: base.charge_state === true,
    status: base.error ? 'statusBaseOffline' : moving ? 'statusMoving' : 'statusReady',
    body:
      !b.error && num(b.lift_mm) && num(b.waist_deg) && num(b.head_yaw_deg) && num(b.head_pitch_deg)
        ? {
            liftMm: b.lift_mm,
            waistDeg: b.waist_deg,
            headYawDeg: b.head_yaw_deg,
            headPitchDeg: b.head_pitch_deg,
            enabled: typeof b.enabled === 'boolean' ? b.enabled : null,
          }
        : null,
    // powered but not enabled shows blue on the real ring, enabled green, no power dark
    armState: arm.error || !arm.power ? 'off' : arm.enable ? 'enabled' : 'disabled',
    armSilent: !!arm.error,
    pose:
      !base.error && num(base.current_pose?.x) && num(base.current_pose?.y)
        ? { x: base.current_pose.x, y: base.current_pose.y, theta: num(base.current_pose.theta) ? base.current_pose.theta : 0 }
        : null,
  };
}

export async function getStatus(baseUrl: string, timeoutMs = 4000): Promise<RobotStatus> {
  const res = await fetchWithTimeout(`${baseUrl}/status`, timeoutMs);
  if (!res.ok) throw new Error(`status: HTTP ${res.status}`);
  return toStatus((await res.json()) as RawStatus);
}

/** The arm's six joint angles in degrees, or null when the arm does not answer. */
export async function getArmJoints(baseUrl: string, timeoutMs = 3000): Promise<number[] | null> {
  const res = await fetchWithTimeout(`${baseUrl}/arm/state`, timeoutMs);
  if (!res.ok) return null;
  const raw = (await res.json()) as RawArmState;
  return !raw.error && Array.isArray(raw.joints) && raw.joints.length === 6 && raw.joints.every(num) ? raw.joints : null;
}

// ---------- current task (/tasks/state, lumi-wave tasks/fetch.py) ----------
interface RawTaskState {
  status?: string;
  step?: string;
  holding?: boolean;
  paused?: boolean;
}

export type TaskPhase = 'running' | 'waiting' | 'holding' | 'done' | 'stopped' | 'failed';

export interface TaskState {
  phase: TaskPhase;
  /** The step as the robot names it ("driving to the source"); empty between steps. */
  step: string;
  paused: boolean;
  holding: boolean;
  /** True while Lumi holds the object out to a person: the Release button opens the hand. */
  giving: boolean;
}

const PHASES: TaskPhase[] = ['running', 'waiting', 'holding', 'done', 'stopped', 'failed'];

/** A task that has ended: its card shows how it ended for a moment, and only if the app saw it going. */
export const isEnded = (p: TaskPhase) => p === 'done' || p === 'stopped' || p === 'failed';

/** The task as the card shows it, or null when no task has run since the robot started. */
export function toTaskState(raw: RawTaskState): TaskState | null {
  const phase = PHASES.find((p) => p === raw.status);
  if (!phase) return null;
  const step = typeof raw.step === 'string' ? raw.step : '';
  return {
    phase,
    step: step === 'holding' ? '' : step,
    paused: raw.paused === true,
    holding: raw.holding === true,
    giving: step === 'giving',
  };
}

export type TaskCommand = 'pause' | 'resume' | 'stop' | 'release';

/** The buttons a task offers right now: none once it has ended. */
export function taskButtons(task: TaskState): TaskCommand[] {
  if (isEnded(task.phase)) return [];
  const out: TaskCommand[] = [];
  if (task.phase === 'running' || task.phase === 'waiting') out.push(task.paused ? 'resume' : 'pause');
  if (task.giving) out.push('release');
  out.push('stop');
  return out;
}

// the robot names its steps in English; these are the ones the app can say in both languages
const STEP_TEXT: Record<string, TextKey> = {
  preparing: 'stepPreparing',
  looking: 'stepLooking',
  'driving to the source': 'stepDrivingSource',
  'driving to the destination': 'stepDrivingDestination',
  'driving round': 'stepDrivingRound',
  'turning to face it': 'stepTurning',
  'turning my waist to reach it': 'stepTurning',
  'asking to move it closer': 'stepAskingCloser',
  reaching: 'stepReaching',
  'reaching out': 'stepReaching',
  picking: 'stepPicking',
  carry: 'stepCarrying',
  placing: 'stepPlacing',
  giving: 'stepGiving',
  receiving: 'stepReceiving',
  'receiving: waiting for okay': 'stepReceiving',
  speaking: 'stepSpeaking',
};

/** A step the app knows in both languages, or null (then the robot's own words are shown). */
export function stepText(step: string): TextKey | null {
  if (step.startsWith('waiting')) return 'stepWaiting';
  return STEP_TEXT[step] ?? null;
}

// ---------- modes (/assistant/modes) ----------
interface RawModes {
  greeter?: boolean;
  patrol?: boolean;
  wave_greet?: boolean;
  welcome?: boolean;
  running?: boolean;
}

export type Mode = 'greeter' | 'patrol' | 'wave_greet' | 'welcome';
export const MODES: Mode[] = ['greeter', 'patrol', 'wave_greet', 'welcome'];
export const MODE_TEXT: Record<Mode, TextKey> = {
  greeter: 'modeGreeter',
  patrol: 'modePatrol',
  wave_greet: 'modeWave',
  welcome: 'modeWelcome',
};

export type Modes = Record<Mode, boolean>;

/**
 * Greeter and Patrol are on only while the assistant runs them: STOP ends the assistant but keeps the switches, and
 * switching one on again starts it (lumi-wave modes_set). Wave and Welcome work without the assistant, so they show
 * the switch as the robot keeps it (the robot turns them off itself after a STOP or an arm fault).
 */
export function toModes(raw: RawModes): Modes {
  const running = raw.running === true;
  return {
    greeter: running && raw.greeter === true,
    patrol: running && raw.patrol === true,
    wave_greet: raw.wave_greet === true,
    welcome: raw.welcome === true,
  };
}

// ---------- reading ----------
async function getJson<T>(baseUrl: string, path: string, timeoutMs: number, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, timeoutMs, init);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getTaskState(baseUrl: string, timeoutMs = 3000): Promise<TaskState | null> {
  return toTaskState(await getJson<RawTaskState>(baseUrl, '/tasks/state', timeoutMs));
}

export async function getModes(baseUrl: string, timeoutMs = 3000): Promise<Modes> {
  return toModes(await getJson<RawModes>(baseUrl, '/assistant/modes', timeoutMs));
}

// ---------- commands ----------
const post = (baseUrl: string, path: string, body?: object, timeoutMs = 5000) =>
  getJson<unknown>(baseUrl, path, timeoutMs, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

/** STOP everything: base drive, arm program, task and the assistant. */
export const stopAll = (baseUrl: string) => post(baseUrl, '/stop');

// ---------- the map (lumi-wave /map/*, /agv/*) ----------
export async function getMapInfo(baseUrl: string, timeoutMs = 8000): Promise<MapInfo> {
  return toMapInfo(await getJson<Parameters<typeof toMapInfo>[0]>(baseUrl, '/map/info', timeoutMs));
}

/** The map picture in the app's dark look; `v` changes the address when the map changed (no stale cached picture). */
export const mapImageUrl = (baseUrl: string, m: MapInfo, v: number) =>
  `${baseUrl}/map/image?map_name=${encodeURIComponent(m.name)}&floor=${m.floor}&dark=true&v=${v}`;

export const goMarker = (baseUrl: string, marker: string) => post(baseUrl, '/agv/go', { marker });
export const goPoint = (baseUrl: string, x: number, y: number, theta: number) =>
  post(baseUrl, '/agv/go_point', { x, y, theta });
/** A marker where Lumi stands (no x, y) or at a point of the map; `charger`: the base docks with it. */
export const saveMarker = (baseUrl: string, name: string, at?: { x: number; y: number; theta: number }, charger = false) =>
  post(baseUrl, '/map/marker', { name, ...at, charger });
export const deleteMarker = (baseUrl: string, name: string) => post(baseUrl, '/map/marker/delete', { name });
/** Drive through markers in order; `loop`: there and back `rounds` times (0 = until stopped), needs the assistant.
 * Refused (BusyError) when loop is asked without Greeter or Patrol on. Says who drives it: the API or the assistant. */
export async function startRoute(
  baseUrl: string,
  markers: string[],
  opts: { pause: number; loop: boolean; rounds: number },
): Promise<'api' | 'assistant'> {
  try {
    const r = await post(baseUrl, '/agv/route', { markers, ...opts });
    return (r as { by?: string }).by === 'assistant' ? 'assistant' : 'api';
  } catch (e) {
    if (e instanceof Error && e.message.endsWith('HTTP 409')) throw new BusyError('busy');
    throw e;
  }
}
/** Progress of the last route the API drove (not one the assistant drives). */
export async function getRoute(baseUrl: string, timeoutMs = 3000): Promise<RouteProgress | null> {
  return toRouteProgress(await getJson<Parameters<typeof toRouteProgress>[0]>(baseUrl, '/agv/route', timeoutMs));
}
/** Stops the drive and the route. */
export const cancelDrive = (baseUrl: string) => post(baseUrl, '/agv/cancel');
/** Tell the base where Lumi is on the map (after a map switch, or when its icon is off). */
export const setPosition = (baseUrl: string, x: number, y: number, theta: number) =>
  post(baseUrl, '/map/position', { x, y, theta });
/** What the lidar sees now: points [x ahead, y left] (m) around the base (lumi-wave /map/scan). */
export async function getScan(baseUrl: string, timeoutMs = 5000): Promise<number[][]> {
  return (await getJson<{ points?: number[][] }>(baseUrl, '/map/scan', timeoutMs)).points ?? [];
}

/** The base restarts with the other map; Lumi's position is set after. */
export const switchMap = (baseUrl: string, name: string, floor: number) =>
  post(baseUrl, '/map/switch', { map_name: name, floor }, 15000);

export async function setMode(baseUrl: string, mode: Mode, on: boolean): Promise<Modes> {
  return toModes((await post(baseUrl, '/assistant/modes', { [mode]: on }, 10000)) as RawModes);
}

/** Lift, waist and head (all four body joints) enabled or disabled. */
export const setBodyEnabled = (baseUrl: string, on: boolean) => post(baseUrl, '/body/enable', { on }, 15000);

/** Arm power on or off. The controller must be up; with the power on the ring light turns blue. */
export const setArmPower = (baseUrl: string, on: boolean) => post(baseUrl, '/arm/power', { on }, 15000);

/** Arm servos on or off; the arm must have power. Off, it holds by its brakes. */
export const setArmEnabled = (baseUrl: string, on: boolean) => post(baseUrl, '/arm/enable', { on }, 10000);

export const taskCommand = (baseUrl: string, cmd: TaskCommand) => post(baseUrl, `/tasks/${cmd}`);

// ---------- hold-to-move (/jog) ----------
/** The robot refuses hand control while a task runs (HTTP 409). */
export class BusyError extends Error {}

/** Keeps one axis moving for 0.35 s more; call again about every 150 ms while the joystick is held. */
export async function jog(baseUrl: string, cmd: AxisCommand): Promise<void> {
  const res = await fetchWithTimeout(`${baseUrl}/jog`, 1000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (res.status === 409) throw new BusyError('busy');
  if (!res.ok) throw new Error(`/jog: HTTP ${res.status}`);
}

/** Stops every hold-to-move axis at once (the robot would also stop by itself 0.35 s after the last jog). */
export const jogStop = (baseUrl: string) => post(baseUrl, '/jog/stop', undefined, 2000);
