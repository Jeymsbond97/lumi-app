// Where the arm's flange is for given joint angles, in the controller's frame (Cobo π, GET /arm/state's tcp): the
// model's own link chain (assets/model/lumi.glb, from joint_l_a1 to link_at) placed on the controller's base.
// Fitted on 2026-11-19 to 13 kine_forward readings of the controller (src/lib/__tests__/armFrame.test.ts), within
// about 1 mm: the model's joint angles ARE the controller's (no signs or zero offsets to change), and the controller's
// base frame sees the model's arm frame turned so that the model's J1 axis (its y) is the controller's +x, its x the
// controller's -z and its z the controller's -y, 30.4 mm along +x. On Lumi the arm is mounted on its side: J1 lies
// along x, level, and the controller's z is up. web/home3d.html places the arm the same way in its arm view.

type V3 = [number, number, number];
type M3 = [V3, V3, V3]; // rows

/** The chain: each joint's place in its parent link (m) and turn (quaternion x, y, z, w); each link turns about y. */
const CHAIN: { t: V3; q: [number, number, number, number] }[] = [
  { t: [0, 0, 0], q: [0, 0, 0, 1] }, // J1: link_a1 sits on joint_l_a1
  { t: [0, 0.156, 0.0165], q: [0.5, 0.5, 0.5, 0.5] },
  { t: [0.21, -0.029, 0], q: [0, 0, 0, 1] },
  { t: [0.1303, 0.0185, 0], q: [-0.5, -0.5, -0.5, 0.5] },
  { t: [0, 0.0802, -0.0187], q: [0.5, -0.5, -0.5, 0.5] },
  { t: [-0.1233, 0.01805, 0], q: [0.5, -0.5, 0.5, 0.5] },
];
/** The flange (link_at) in link_a6. */
const TOOL: V3 = [0, 0.036, 0];

/** The model's arm frame in the controller's base frame: rows give the controller's x, y, z of a model vector. */
export const ARM_MOUNT: { rotation: M3; offsetMm: V3 } = {
  rotation: [
    [0, 1, 0],
    [0, 0, -1],
    [-1, 0, 0],
  ],
  offsetMm: [30.4, -0.4, 0.1],
};

const mul = (a: M3, b: M3): M3 =>
  [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c])) as M3;
const apply = (m: M3, v: V3): V3 => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]) as V3;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function fromQuat([x, y, z, w]: [number, number, number, number]): M3 {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
const rotY = (a: number): M3 => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];

/** The flange's place (mm) in the controller's frame for the six joint angles (deg), as the controller reports. */
export function flangeMm(jointsDeg: number[]): V3 {
  let rot: M3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  let pos: V3 = [0, 0, 0];
  CHAIN.forEach((link, i) => {
    pos = add(pos, apply(rot, link.t));
    rot = mul(mul(rot, fromQuat(link.q)), rotY((jointsDeg[i] * Math.PI) / 180));
  });
  pos = add(pos, apply(rot, TOOL));
  return add(apply(ARM_MOUNT.rotation, [pos[0] * 1000, pos[1] * 1000, pos[2] * 1000]), ARM_MOUNT.offsetMm);
}
