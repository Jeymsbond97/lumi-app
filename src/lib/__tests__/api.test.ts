import { toStatus } from '../api';

describe('toStatus', () => {
  it('reads battery, charging, body and arm from a full /status reply', () => {
    const s = toStatus({
      base: { power_percent: 98, charge_state: true, move_status: 'idle', current_pose: { x: -1.13, y: 0.004, theta: 0.04 } },
      body: { lift_mm: 75, waist_deg: -12.5, head_yaw_deg: 30, head_pitch_deg: 5, enabled: true },
      arm: { power: true, enable: true },
    });
    expect(s).toEqual({
      battery: 98,
      charging: true,
      status: 'statusReady',
      body: { liftMm: 75, waistDeg: -12.5, headYawDeg: 30, headPitchDeg: 5, enabled: true },
      armState: 'enabled',
      armSilent: false,
      pose: { x: -1.13, y: 0.004, theta: 0.04 },
    });
  });

  it('shows the arm as off when it does not answer, and no body when the head controller is silent', () => {
    // the reply Thor gave on 2026-11-12 with the arm and head controller off
    const s = toStatus({
      base: { power_percent: 98, charge_state: true, move_status: 'idle' },
      body: { error: '<urlopen error timed out>' },
      arm: { error: 'no reply within 2.5 s' },
    });
    expect(s.armState).toBe('off');
    expect(s.armSilent).toBe(true);
    expect(s.pose).toBeNull();                         // no pose in the reply: none drawn on the map
    expect(s.body).toBeNull();
  });

  it('reads a disabled body, and an unknown one from an API without the field', () => {
    const body = { lift_mm: 0, waist_deg: 0, head_yaw_deg: 0, head_pitch_deg: -5 };
    expect(toStatus({ body: { ...body, enabled: false } }).body?.enabled).toBe(false);
    expect(toStatus({ body }).body?.enabled).toBeNull();
  });

  it('tells a powered but not enabled arm apart', () => {
    expect(toStatus({ arm: { power: true, enable: false } }).armState).toBe('disabled');
    expect(toStatus({ arm: { power: false, enable: false } }).armState).toBe('off');
  });

  it('marks the base offline or moving', () => {
    expect(toStatus({ base: { error: 'timeout' } }).status).toBe('statusBaseOffline');
    expect(toStatus({ base: { move_status: 'running' } }).status).toBe('statusMoving');
  });
});
