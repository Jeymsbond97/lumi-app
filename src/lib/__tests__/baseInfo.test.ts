import {
  addToTrail,
  baseText,
  driving,
  estopLook,
  estopShown,
  rangeText,
  sensorName,
  speedText,
  toBaseState,
  toPlan,
  toSensors,
  TRAIL_JUMP_M,
  TRAIL_MAX,
  TRAIL_STEP_M,
  trailLength,
  turnText,
  type Trail,
} from '../baseInfo';
import { centreOn } from '../mapGeom';
import { toStatus } from '../api';

// the base part of lumi-wave /status on 2026-11-18 (Lumi on its charger), and the base's own robot_status fields
const IDLE = {
  power_percent: 100,
  charge_state: true,
  current_pose: { theta: -0.04, x: -1.21, y: 0.06 },
  move_status: 'idle',
  move_target: '',
  running_status: 'idle',
  error_code: '00000000',
  estop_state: false,
  is_paused: false,
};

describe('toBaseState', () => {
  it('reads an idle base without a fault', () => {
    expect(toBaseState(IDLE)).toEqual({
      move: 'idle',
      running: 'idle',
      target: '',
      errorCode: null,
      softEstop: false,
      hardEstop: false,
      paused: false,
    });
  });

  it('is null when the base does not answer', () => {
    expect(toBaseState({ error: 'timed out' })).toBeNull();
    expect(toBaseState(undefined)).toBeNull();
    expect(toStatus({ base: { error: 'timed out' } }).base).toBeNull();
  });

  it('keeps a fault code', () => {
    expect(toBaseState({ ...IDLE, error_code: '00010000' })?.errorCode).toBe('00010000');
  });

  it('tells the soft E-stop from the hardware one once the API sends both', () => {
    const soft = toBaseState({ ...IDLE, estop_state: true, soft_estop_state: true, hard_estop_state: false });
    expect(soft?.softEstop).toBe(true);
    expect(soft?.hardEstop).toBe(false);
    const hard = toBaseState({ ...IDLE, estop_state: true, soft_estop_state: false, hard_estop_state: true });
    expect(hard?.softEstop).toBe(false);
    expect(hard?.hardEstop).toBe(true);
  });

  it('takes estop_state as the soft E-stop from an API that sends only it', () => {
    expect(toBaseState({ ...IDLE, estop_state: true })?.softEstop).toBe(true);
  });
});

describe('the base in words', () => {
  const b = toBaseState(IDLE)!;
  it('says the drive, then what holds it', () => {
    expect(baseText(b)).toBe('baseIdle');
    expect(baseText({ ...b, move: 'running', running: 'running' })).toBe('baseDriving');
    expect(baseText({ ...b, move: 'running', running: 'dock_to_charging_pile' })).toBe('baseDocking');
    expect(baseText({ ...b, move: 'succeeded' })).toBe('baseArrived');
    expect(baseText({ ...b, move: 'canceled' })).toBe('baseCancelled');
    expect(baseText({ ...b, move: 'running', softEstop: true })).toBe('baseHeld');
    expect(baseText({ ...b, move: 'running', hardEstop: true, softEstop: true })).toBe('baseHardEstop');
    expect(baseText({ ...b, move: 'something new' })).toBe('baseIdle');
  });
  it('counts a held drive as driving', () => {
    expect(driving({ ...b, move: 'running', softEstop: true })).toBe(true);
    expect(driving(b)).toBe(false);
    expect(driving(null)).toBe(false);
  });
});

describe('E-STOP', () => {
  const b = toBaseState(IDLE)!;
  it('shows what was pressed until the base says so', () => {
    expect(estopLook(b, null)).toBe('ready');
    expect(estopLook(b, true)).toBe('held');
    expect(estopLook({ ...b, softEstop: true }, null)).toBe('held');
    expect(estopLook({ ...b, softEstop: true }, false)).toBe('ready');
    expect(estopLook(null, null)).toBe('ready');
  });
  it('says when the red button on Lumi holds it, whatever was pressed', () => {
    expect(estopLook({ ...b, hardEstop: true }, false)).toBe('hard');
  });
  it('shows on the Map always, elsewhere only while Lumi drives or is held', () => {
    expect(estopShown(true, null)).toBe(true);
    expect(estopShown(false, b)).toBe(false);
    expect(estopShown(false, { ...b, move: 'running' })).toBe(true);
    expect(estopShown(false, { ...b, softEstop: true })).toBe(true);
    expect(estopShown(false, { ...b, hardEstop: true })).toBe(true);
  });
});

describe('sensors', () => {
  it('reads speed and ranges, nothing in range as null, sorted left to right then back', () => {
    const s = toSensors({
      linear: 0.31,
      angular: -0.2,
      ultrasonic: { r1: 0.8, m: 2.5, l1: 0, b: null },
      infrared: { m: 0.0005, l1: 0.4 },
    });
    expect(s.linear).toBe(0.31);
    expect(s.angular).toBe(-0.2);
    expect(s.ultrasonic).toEqual([
      { name: 'l1', m: null },
      { name: 'm', m: 2.5 },
      { name: 'r1', m: 0.8 },
      { name: 'b', m: null },
    ]);
    expect(s.infrared).toEqual([
      { name: 'l1', m: 0.4 },
      { name: 'm', m: null },
    ]);
  });
  it('is empty when the base sends none', () => {
    expect(toSensors({})).toEqual({ linear: null, angular: null, ultrasonic: [], infrared: [] });
  });
  it('names the sensors as the base page does', () => {
    expect(sensorName('m')).toEqual({ side: 'sensorFront', n: '' });
    expect(sensorName('b')).toEqual({ side: 'sensorBack', n: '' });
    expect(sensorName('l2')).toEqual({ side: 'sensorLeft', n: '2' });
    expect(sensorName('r1')).toEqual({ side: 'sensorRight', n: '1' });
    expect(sensorName('ex1')).toEqual({ side: null, n: 'ex1' });
  });
  it('writes metres and turns', () => {
    expect(rangeText(0.456)).toBe('0.46 m');
    expect(speedText(0.3)).toBe('0.30 m/s');
    expect(turnText(Math.PI / 4)).toBe('45 °/s');
  });
});

describe('toPlan', () => {
  it('keeps the points it can read', () => {
    expect(toPlan({ points: [[1, 2], [3, 'x'], [4.5, -1]] })).toEqual([
      { x: 1, y: 2 },
      { x: 4.5, y: -1 },
    ]);
    expect(toPlan({})).toEqual([]);
  });
});

describe('the trail', () => {
  it('adds a point only when Lumi moved far enough', () => {
    let t: Trail = addToTrail([], { x: 0, y: 0 });
    t = addToTrail(t, { x: TRAIL_STEP_M / 2, y: 0 });
    expect(trailLength(t)).toBe(1);
    t = addToTrail(t, { x: 0.2, y: 0 });
    expect(t).toEqual([
      [
        { x: 0, y: 0 },
        { x: 0.2, y: 0 },
      ],
    ]);
  });
  it('starts a new piece after a jump (a position set on the map)', () => {
    const t = addToTrail(addToTrail([], { x: 0, y: 0 }), { x: TRAIL_JUMP_M + 1, y: 0 });
    expect(t.length).toBe(2);
  });
  it('keeps the newest points only', () => {
    let t: Trail = [];
    for (let i = 0; i < TRAIL_MAX + 50; i++) t = addToTrail(t, { x: i * 0.1, y: 0 });
    expect(trailLength(t)).toBe(TRAIL_MAX);
    expect(t[t.length - 1].at(-1)?.x).toBeCloseTo((TRAIL_MAX + 49) * 0.1);
    expect(t[0][0].x).toBeCloseTo(50 * 0.1);
  });
});

describe('centreOn', () => {
  it('puts the pixel in the middle of the view', () => {
    const o = centreOn(100, 50, 2, 800, 400);
    expect(o.x + 100 * 2).toBe(400);
    expect(o.y + 50 * 2).toBe(200);
  });
});
