import { toSceneState } from '../sceneState';

describe('toSceneState', () => {
  it('turns degrees into radians and millimetres into metres', () => {
    const s = toSceneState(
      { battery: 50, charging: false, status: 'statusReady', armState: 'enabled',
        body: { liftMm: 400, waistDeg: 90, headYawDeg: -45, headPitchDeg: 30 } },
      [0, 90, 0, 0, 180, 0],
    );
    expect(s.lift).toBeCloseTo(0.4);
    expect(s.waist).toBeCloseTo(Math.PI / 2);
    expect(s.head).toBeCloseTo(-Math.PI / 4);
    expect(s.neck).toBeCloseTo(Math.PI / 6);
    expect(s.arm?.[1]).toBeCloseTo(Math.PI / 2);
    expect(s.arm?.[4]).toBeCloseTo(Math.PI);
  });

  it('leaves out parts that did not answer so the robot keeps its last pose', () => {
    const s = toSceneState({ battery: 50, charging: true, status: 'statusReady', armState: 'off', body: null }, null);
    expect(s).toEqual({ armState: 'off', charging: true });
  });
});
