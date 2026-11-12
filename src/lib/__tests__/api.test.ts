import { toStatus } from '../api';

describe('toStatus', () => {
  it('reads battery, charging, body and arm from a full /status reply', () => {
    const s = toStatus({
      base: { power_percent: 98, charge_state: true, move_status: 'idle' },
      body: { lift_mm: 75, waist_deg: -12.5, head_yaw_deg: 30, head_pitch_deg: 5 },
      arm: { power: true, enable: true },
    });
    expect(s).toEqual({
      battery: 98,
      charging: true,
      status: 'statusReady',
      body: { liftMm: 75, waistDeg: -12.5, headYawDeg: 30, headPitchDeg: 5 },
      armState: 'enabled',
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
    expect(s.body).toBeNull();
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
