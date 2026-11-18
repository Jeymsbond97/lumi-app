// The arm and gripper buttons on Drive (lumi-wave api/server.py):
// - GET /arm/poses: {name: [6 joints in deg]} of the taught poses of the pose graph.
// - POST /arm/pose {name, speed}: goes there along the pose graph, every joint move checked first; answers when the
//   arm is there (409 with the reason when a move is refused, 404 for an unknown pose). speed: slow, normal or route.
// - POST /arm/stop: stops the arm's motion, program or skill now.
// - GET /gripper/state: {closed, holding, object_in_front, gap_mm, ...}; POST /gripper/open and /gripper/close answer
//   after the stroke (about 1.5 s) with the state after it.
// Every POST but /arm/stop is refused with 409 while a task runs.
import { BusyError, post } from './api';
import { fetchWithTimeout } from './connection';
import type { TextKey } from './i18n';

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

/** The pose speed the app uses: the slowest the robot has (20 deg/s). */
export const POSE_SPEED = 'slow';
/** /arm/pose answers once the arm is there; slow moves along the graph can take this long. */
const POSE_TIMEOUT_MS = 120000;

export const goPose = (baseUrl: string, name: string) =>
  orBusy(post(baseUrl, '/arm/pose', { name, speed: POSE_SPEED }, POSE_TIMEOUT_MS));

export const armStop = (baseUrl: string) => post(baseUrl, '/arm/stop', undefined, 5000);

export async function getGripper(baseUrl: string, timeoutMs = 3000): Promise<GripperState | null> {
  const res = await fetchWithTimeout(`${baseUrl}/gripper/state`, timeoutMs);
  if (!res.ok) return null;
  return toGripperState((await res.json()) as Parameters<typeof toGripperState>[0]);
}

export const openGripper = (baseUrl: string) => orBusy(post(baseUrl, '/gripper/open', undefined, 8000));
export const closeGripper = (baseUrl: string) => orBusy(post(baseUrl, '/gripper/close', undefined, 8000));
