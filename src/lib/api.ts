import { fetchWithTimeout } from './connection';
import type { TextKey } from './i18n';

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
  };
  body?: Failed & {
    lift_mm?: number;
    waist_deg?: number;
    head_yaw_deg?: number;
    head_pitch_deg?: number;
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
}

export interface RobotStatus {
  battery: number | null;
  charging: boolean;
  status: TextKey;
  /** null when the head and lift controller does not answer. */
  body: Body | null;
  armState: ArmState;
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
        ? { liftMm: b.lift_mm, waistDeg: b.waist_deg, headYawDeg: b.head_yaw_deg, headPitchDeg: b.head_pitch_deg }
        : null,
    // powered but not enabled shows blue on the real ring, enabled green, no power dark
    armState: arm.error || !arm.power ? 'off' : arm.enable ? 'enabled' : 'disabled',
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
