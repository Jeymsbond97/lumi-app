// The arm and gripper buttons on Drive (lumi-wave api/server.py):
// - GET /arm/poses: {name: [6 joints in deg]} of the taught poses of the pose graph, the ones people saved too.
// - GET /arm/poses/saved: the same, only the poses people saved (404 on an older robot API: nothing can be deleted).
// - POST /arm/pose {name}: goes there along the pose graph, every joint move checked first; answers when the arm is
//   there (409 with the reason when a move is refused, 404 for an unknown pose). Without a speed the robot's global
//   arm speed applies; an older robot API (no /arm/speed) gets speed "slow" as before.
// - POST /arm/teach {name}: saves where the arm is now as a pose (409 for a built in pose's name, 400 a bad name).
// - DELETE /arm/poses/{name}: deletes a saved pose (409 for a built in one, 404 unknown).
// - GET /arm/speed, POST /arm/speed {percent}: the global arm speed {percent, min, max} (lib/speed).
// - POST /arm/stop: stops the arm's motion, program or skill now.
// - GET /gripper/state: {closed, holding, object_in_front, gap_mm, ...}; POST /gripper/open and /gripper/close answer
//   after the stroke (about 1.5 s) with the state after it.
// Every POST but /arm/stop is refused with 409 while a task runs.
import { BusyError, NeedsUpdateError, post } from './api';
import { send, type Reply } from './commands';
import { fetchWithTimeout } from './connection';
import type { TextKey } from './i18n';
import { toArmSpeed, type ArmSpeed } from './speed';

/** Poses in the order the old dashboard listed them; others follow by name. */
const POSE_ORDER = ['look', 'ready', 'carry', 'give_pre', 'give', 'rest', 'bag', 'wave_out', 'wave_start', 'wave'];

/** The pose names the app can say in both languages; another one is shown as the robot names it. */
export const POSE_TEXT: Record<string, TextKey> = {
  look: 'poseLook',
  ready: 'poseReady',
  carry: 'poseCarry',
  give_pre: 'poseGivePre',
  give: 'poseGive',
  rest: 'poseRest',
  bag: 'poseBag',
  wave_out: 'poseWaveOut',
  wave_start: 'poseWaveStart',
  wave: 'poseWave',
};

export function sortPoses(names: string[]): string[] {
  const rank = (n: string) => {
    const i = POSE_ORDER.indexOf(n);
    return i < 0 ? POSE_ORDER.length : i;
  };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The pose names out of /arm/poses; a reply of another shape gives none. */
export function toPoseNames(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return sortPoses(Object.keys(raw).filter((k) => Array.isArray((raw as Record<string, unknown>)[k])));
}

export type GripperState = 'open' | 'closed' | 'holding';

export const GRIPPER_TEXT: Record<GripperState, TextKey> = {
  open: 'gripperIsOpen',
  closed: 'gripperIsClosed',
  holding: 'gripperIsHolding',
};

export function toGripperState(raw: { closed?: unknown; holding?: unknown; error?: unknown }): GripperState | null {
  if (raw.error || typeof raw.closed !== 'boolean') return null;
  if (raw.holding === true) return 'holding';
  return raw.closed ? 'closed' : 'open';
}

const orBusy = async <T>(call: Promise<T>): Promise<T> => {
  try {
    return await call;
  } catch (e) {
    if (e instanceof Error && e.message.endsWith('HTTP 409')) throw new BusyError('busy');
    throw e;
  }
};

export async function getPoseNames(baseUrl: string, timeoutMs = 5000): Promise<string[]> {
  const res = await fetchWithTimeout(`${baseUrl}/arm/poses`, timeoutMs);
  if (!res.ok) throw new Error(`/arm/poses: HTTP ${res.status}`);
  return toPoseNames(await res.json());
}

/** Only the poses people saved; null when the robot's API cannot say (no delete then). */
export async function getSavedPoseNames(baseUrl: string, timeoutMs = 5000): Promise<string[] | null> {
  const res = await fetchWithTimeout(`${baseUrl}/arm/poses/saved`, timeoutMs);
  if (!res.ok) return null;
  return toPoseNames(await res.json());
}

/** The pose speed for a robot without the global arm speed: the slowest it has (20 deg/s). */
export const LEGACY_POSE_SPEED = 'slow';
/** /arm/pose answers once the arm is there; slow moves along the graph can take this long. */
const POSE_TIMEOUT_MS = 120000;

/** `legacy`: the robot has no /arm/speed, so the pose goes slowly as it always did. */
export const goPose = (baseUrl: string, name: string, legacy = false) =>
  orBusy(post(baseUrl, '/arm/pose', legacy ? { name, speed: LEGACY_POSE_SPEED } : { name }, POSE_TIMEOUT_MS));

/** A pose name the robot takes: 1 to 24 letters, digits, _ or -, around spaces trimmed. */
export const validPoseName = (name: string): boolean => /^[A-Za-z0-9_-]{1,24}$/.test(name.trim());

/** The first free pose_1, pose_2, ... */
export function nextPoseName(taken: string[]): string {
  for (let i = 1; ; i++) if (!taken.includes(`pose_${i}`)) return `pose_${i}`;
}

/** Saves where the arm is now under `name` (trimmed); a refusal comes back with the robot's reason. */
export const teachPose = (baseUrl: string, name: string): Promise<Reply> =>
  send(baseUrl, { path: '/arm/teach', body: { name: name.trim() }, timeoutMs: 8000 });

export const deletePose = (baseUrl: string, name: string): Promise<Reply> =>
  send(baseUrl, { path: `/arm/poses/${encodeURIComponent(name)}`, method: 'DELETE', timeoutMs: 8000 });

/** The global arm speed; throws NeedsUpdateError on a robot API without it (HTTP 404). */
export async function getArmSpeed(baseUrl: string, timeoutMs = 4000): Promise<ArmSpeed> {
  const res = await fetchWithTimeout(`${baseUrl}/arm/speed`, timeoutMs);
  if (res.status === 404) throw new NeedsUpdateError('update');
  if (!res.ok) throw new Error(`/arm/speed: HTTP ${res.status}`);
  const speed = toArmSpeed(await res.json());
  if (!speed) throw new Error('/arm/speed: no percent');
  return speed;
}

export const setArmSpeed = (baseUrl: string, percent: number): Promise<Reply> =>
  send(baseUrl, { path: '/arm/speed', body: { percent }, timeoutMs: 4000 });

export const armStop = (baseUrl: string) => post(baseUrl, '/arm/stop', undefined, 5000);

export async function getGripper(baseUrl: string, timeoutMs = 3000): Promise<GripperState | null> {
  const res = await fetchWithTimeout(`${baseUrl}/gripper/state`, timeoutMs);
  if (!res.ok) return null;
  return toGripperState((await res.json()) as Parameters<typeof toGripperState>[0]);
}

export const openGripper = (baseUrl: string) => orBusy(post(baseUrl, '/gripper/open', undefined, 8000));
export const closeGripper = (baseUrl: string) => orBusy(post(baseUrl, '/gripper/close', undefined, 8000));
