import type { ArmState, RobotStatus } from '../lib/api';

/** What `window.lumi.setState` in web/home3d.html takes: radians and metres, in the URDF's joint frames. */
export interface SceneState {
  head?: number; // l_3, head yaw
  neck?: number; // l_4, head pitch
  waist?: number; // l_2
  lift?: number; // l_1, metres, 0 = lowest
  arm?: number[]; // l_a1..l_a6
  armState: ArmState;
  charging: boolean;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Parts that did not answer are left out, so the 3D robot keeps its last known pose for them.
 * Directions follow the URDF; check them once against the real robot when it is powered.
 */
export function toSceneState(status: RobotStatus, armJointsDeg: number[] | null): SceneState {
  const s: SceneState = { armState: status.armState, charging: status.charging };
  if (status.body) {
    s.head = rad(status.body.headYawDeg);
    s.neck = rad(status.body.headPitchDeg);
    s.waist = rad(status.body.waistDeg);
    s.lift = status.body.liftMm / 1000;
  }
  if (armJointsDeg) s.arm = armJointsDeg.map(rad);
  return s;
}
