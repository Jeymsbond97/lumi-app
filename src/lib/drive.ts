// Joystick to base motion. The robot (lumi-wave api/control.py) drives the base while /jog is called about every
// 150 ms and stops by itself 0.35 s after the last call; base_drive and base_turn are joined into one motion there.
// Top speed there: 0.3 m/s forward or back, 0.6 rad/s turning. On Lumi a positive base_turn turns RIGHT (clockwise):
// checked on the robot 2026-11-13, the joystick pushed left with -1 turned it right.

export interface AxisCommand {
  axis: 'base_drive' | 'base_turn';
  direction: 1 | -1;
  /** 0.05 to 1 of the axis' top speed */
  speed: number;
}

/** Centre part of the pad, as a share of its radius, where nothing moves (a resting thumb). */
export const DEAD_ZONE = 0.15;
const MIN_SPEED = 0.05;

/** Where the knob is: the finger's offset from the centre, kept inside the pad. */
export function clampToPad(dx: number, dy: number, radius: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d <= radius || d === 0) return { x: dx, y: dy };
  return { x: (dx / d) * radius, y: (dy / d) * radius };
}

function axis(name: AxisCommand['axis'], v: number): AxisCommand | null {
  const a = Math.abs(v);
  if (a < DEAD_ZONE) return null;
  // the dead zone edge is the slowest speed, the pad's rim the fastest
  const speed = MIN_SPEED + ((a - DEAD_ZONE) / (1 - DEAD_ZONE)) * (1 - MIN_SPEED);
  return { axis: name, direction: v > 0 ? 1 : -1, speed: Math.round(Math.min(1, speed) * 100) / 100 };
}

/**
 * Screen offset of the knob (x right, y down, in the same units as radius) to the axes to hold.
 * Up drives forward, down backward; right turns right, left turns left; a diagonal does both.
 */
export function padToJog(x: number, y: number, radius: number): AxisCommand[] {
  if (radius <= 0) return [];
  const { x: cx, y: cy } = clampToPad(x, y, radius);
  return [axis('base_drive', -cy / radius), axis('base_turn', cx / radius)].filter((c): c is AxisCommand => c !== null);
}
