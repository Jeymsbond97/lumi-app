// The shapes of ARM SETUP's Cobo π style controls (ui/ArmPads.tsx) and its TCP read-out, as plain numbers:
// - a joint's quarter ring (9 o'clock to 12 o'clock round the box's bottom right corner), split into a minus half
//   (lower left) and a plus half (upper right), each with a chevron along the ring and a touch box;
// - the round pad for the hand: Y+ top, Y- bottom, X- left, X+ right, as four ring wedges with touch boxes;
// - GET /arm/state's `tcp` [x, y, z mm, rx, ry, rz deg] as the read-out under the 3D view.
// Angles are in degrees on screen: 0 is right, 90 down (SVG's y grows downwards), 180 left, 270 up.
import type { TextKey } from './i18n';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (cx: number, cy: number, r: number, deg: number) => `${(cx + r * Math.cos(rad(deg))).toFixed(2)} ${(cy + r * Math.sin(rad(deg))).toFixed(2)}`;

/** A ring segment from angle a0 to a1 (a1 > a0, at most 180° apart), between radii ri and ro. */
export function ringPath(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${pt(cx, cy, ro, a0)} A${ro} ${ro} 0 ${large} 1 ${pt(cx, cy, ro, a1)} L${pt(cx, cy, ri, a1)} A${ri} ${ri} 0 ${large} 0 ${pt(cx, cy, ri, a0)} Z`;
}

/** A chevron on the ring at angle `at`, pointing along it towards growing (+1) or shrinking (-1) angles. */
export function ringChevron(cx: number, cy: number, r: number, at: number, way: 1 | -1, size: number): string {
  const back = at - way * ((size / r) * (180 / Math.PI));
  return `M${pt(cx, cy, r + size * 0.8, back)} L${pt(cx, cy, r, at)} L${pt(cx, cy, r - size * 0.8, back)}`;
}

export interface JointArc {
  minus: string;
  plus: string;
  minusChevron: string;
  plusChevron: string;
  /** The touch boxes of the two halves. */
  minusBox: Box;
  plusBox: Box;
  /** Where the joint's name sits: the ring's centre, inside the box's bottom right corner. */
  centre: { x: number; y: number };
}

/** A joint's quarter ring in an `s` px square: minus is the lower left half (towards 9 o'clock), plus the upper right. */
export function jointArc(s: number): JointArc {
  const cx = s * 0.94;
  const cy = s * 0.94;
  const ro = s * 0.9;
  const ri = s * 0.5;
  const mid = (ro + ri) / 2;
  const gap = 1.5;
  return {
    minus: ringPath(cx, cy, ro, ri, 180, 225 - gap),
    plus: ringPath(cx, cy, ro, ri, 225 + gap, 270),
    minusChevron: ringChevron(cx, cy, mid, 192, -1, s * 0.07),
    plusChevron: ringChevron(cx, cy, mid, 258, 1, s * 0.07),
    minusBox: { x: 0, y: s * 0.4, w: s * 0.5, h: s * 0.6 },
    plusBox: { x: s * 0.4, y: 0, w: s * 0.6, h: s * 0.5 },
    centre: { x: cx, y: cy },
  };
}

export type PadKey = 'up' | 'right' | 'down' | 'left';

export interface PadWedge {
  key: PadKey;
  path: string;
  /** Where its label goes. */
  label: { x: number; y: number };
  box: Box;
}

/** The round pad, `d` px across: four wedges round a small centre circle of radius `hub`. */
export function padWedges(d: number): { wedges: PadWedge[]; hub: number } {
  const c = d / 2;
  const ro = c - 1;
  const ri = d * 0.2;
  const mid = (ro + ri) / 2 + d * 0.02;
  const gap = 2;
  // each box reaches from the rim towards the hub; the four meet at their corners without overlapping
  const near = d * 0.34;
  const across = d - 2 * near;
  const side = near;
  const make = (key: PadKey, centre: number, box: Box): PadWedge => ({
    key,
    path: ringPath(c, c, ro, ri, centre - 45 + gap, centre + 45 - gap),
    label: { x: c + mid * Math.cos(rad(centre)), y: c + mid * Math.sin(rad(centre)) },
    box,
  });
  return {
    hub: d * 0.12,
    wedges: [
      make('up', 270, { x: side, y: 0, w: across, h: near }),
      make('right', 360, { x: d - near, y: side, w: near, h: across }),
      make('down', 90, { x: side, y: d - near, w: across, h: near }),
      make('left', 180, { x: 0, y: side, w: near, h: across }),
    ],
  };
}

// ---------- the TCP read-out ----------
export type Tcp = [number, number, number, number, number, number];

/** GET /arm/state's `tcp`: six finite numbers, else null (the arm does not answer, an older robot API). */
export function toTcp(raw: unknown): Tcp | null {
  const t = (raw as { tcp?: unknown; error?: unknown } | null)?.tcp;
  if ((raw as { error?: unknown } | null)?.error) return null;
  return Array.isArray(t) && t.length === 6 && t.every((v) => typeof v === 'number' && Number.isFinite(v)) ? (t as Tcp) : null;
}

const TCP_KEYS: TextKey[] = ['tcpX', 'tcpY', 'tcpZ', 'tcpRx', 'tcpRy', 'tcpRz'];

/** The six parts as Cobo π shows them, one decimal: X, Y, Z in mm, RX, RY, RZ in degrees. */
export function tcpParts(tcp: Tcp): { key: TextKey; value: string }[] {
  return tcp.map((v, i) => {
    const n = Math.abs(v) < 0.05 ? 0 : v; // no "-0.0"
    return { key: TCP_KEYS[i], value: i < 3 ? `${n.toFixed(1)} mm` : `${n.toFixed(1)}°` };
  });
}
