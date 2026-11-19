import { flangeMm } from '../armFrame';

// the controller's own forward kinematics (kine_forward, no motion), 2026-11-19: joints (deg) and flange x, y, z (mm)
const SAMPLES: [number[], [number, number, number]][] = [
  [[0, 0, 0, 0, 0, 0], [766.7, -6.0, 0.0]],
  [[90, 0, 0, 0, 0, 0], [766.7, -0.0, -6.0]],
  [[0, 90, 0, 0, 0, 0], [186.2, -6.0, 580.5]],
  [[0, -90, 0, 0, 0, 0], [186.2, -6.0, -580.5]],
  [[0, 0, 90, 0, 0, 0], [396.3, -6.0, 370.4]],
  [[0, 0, 0, 90, 0, 0], [766.7, -6.0, 0.0]],
  [[0, 0, 0, 0, 90, 0], [606.9, -6.0, 159.7]],
  [[0, 0, 0, 0, 0, 90], [766.7, -6.0, 0.0]],
  [[0, 90, 90, 0, 0, 0], [-184.2, -6.0, 210.1]],
  [[30, -45, 60, 20, -40, 10], [681.4, 103.0, -120.2]],
  [[181.13, -88.92, -3.36, -175.06, 38.22, -219.73], [78.4, -13.2, 541.9]],
  [[-239.15, -88.4, -29.48, 199.97, 81.4, 158.35], [-48.8, 274.1, 219.6]],
  [[-288.51, -44.72, -55.82, -180.45, 88.32, -247.07], [139.1, 311.0, -111.8]],
];

describe('the arm in the controller frame', () => {
  it.each(SAMPLES)('joints %j put the flange where the controller says', (joints, want) => {
    const got = flangeMm(joints);
    const err = Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]);
    expect(err).toBeLessThan(3);
  });
});
