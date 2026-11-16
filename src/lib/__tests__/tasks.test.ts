import { stepText, taskButtons, toModes, toTaskState, type RobotStatus, type TaskState } from '../api';
import { holdArm, taskToShow, type ArmMemory, type TaskMemory } from '../robot';

const running: TaskState = { phase: 'running', step: 'picking', paused: false, holding: false, giving: false };

describe('toTaskState', () => {
  it('reads a running task (shape of lumi-wave tasks/fetch.py state())', () => {
    expect(
      toTaskState({ status: 'running', step: 'driving to the source', holding: false, paused: false }),
    ).toEqual({ phase: 'running', step: 'driving to the source', paused: false, holding: false, giving: false });
  });

  it('shows nothing for an idle robot or an unknown status', () => {
    expect(toTaskState({ status: 'idle', step: '' })).toBeNull();
    expect(toTaskState({ status: 'something new' })).toBeNull();
  });

  it('knows when Lumi is handing something over', () => {
    expect(toTaskState({ status: 'running', step: 'giving', holding: true })?.giving).toBe(true);
  });

  it('drops the step word "holding", the phase already says it', () => {
    expect(toTaskState({ status: 'holding', step: 'holding', holding: true })?.step).toBe('');
  });
});

describe('taskButtons', () => {
  it('offers Pause and Stop while running, Resume when paused', () => {
    expect(taskButtons(running)).toEqual(['pause', 'stop']);
    expect(taskButtons({ ...running, paused: true })).toEqual(['resume', 'stop']);
  });

  it('adds Release while giving', () => {
    expect(taskButtons({ ...running, step: 'giving', giving: true })).toEqual(['pause', 'release', 'stop']);
  });

  it('offers only Stop while holding, nothing once ended', () => {
    expect(taskButtons({ ...running, phase: 'holding' })).toEqual(['stop']);
    expect(taskButtons({ ...running, phase: 'done' })).toEqual([]);
  });
});

describe('stepText', () => {
  it('names known steps and any waiting step, and leaves new ones to the robot', () => {
    expect(stepText('driving to the destination')).toBe('stepDrivingDestination');
    expect(stepText('waiting at the kitchen')).toBe('stepWaiting');
    expect(stepText('a step added later')).toBeNull();
  });
});

describe('toModes', () => {
  it('shows a mode on only while the assistant runs it (STOP keeps the switches)', () => {
    expect(toModes({ greeter: true, patrol: false, wave_greet: true, running: false })).toEqual({
      greeter: false,
      patrol: false,
      wave_greet: false,
    });
    expect(toModes({ greeter: true, patrol: false, wave_greet: true, running: true })).toEqual({
      greeter: true,
      patrol: false,
      wave_greet: true,
    });
  });
});

describe('taskToShow', () => {
  const mem = (): TaskMemory => ({ prev: null, endedUntil: 0 });

  it('hides a result left over from before the app was opened', () => {
    expect(taskToShow(mem(), { ...running, phase: 'done' }, 1000)).toBeNull();
  });

  it('shows how a watched task ended for 8 s, then hides it', () => {
    const m = mem();
    expect(taskToShow(m, running, 0)).toEqual(running);
    const done = { ...running, phase: 'done' as const };
    expect(taskToShow(m, done, 1000)).toEqual(done);
    expect(taskToShow(m, done, 8999)).toEqual(done);
    expect(taskToShow(m, done, 9000)).toBeNull();
  });
});

describe('holdArm', () => {
  const st = (armState: RobotStatus['armState'], armSilent = false): RobotStatus =>
    ({ battery: 90, charging: false, status: 'statusReady', body: null, armState, armSilent });

  it('keeps the last arm state while the controller is busy enabling (it does not answer /status then)', () => {
    const mem: ArmMemory = { last: null, at: 0 };
    expect(holdArm(mem, st('disabled'), 0).armState).toBe('disabled');
    expect(holdArm(mem, st('off', true), 1000).armState).toBe('disabled');
    expect(holdArm(mem, st('off', true), 9000).armState).toBe('disabled');
    expect(holdArm(mem, st('enabled'), 10000).armState).toBe('enabled');
  });

  it('shows the arm off when it stays silent, and when it has no power', () => {
    const mem: ArmMemory = { last: null, at: 0 };
    holdArm(mem, st('enabled'), 0);
    expect(holdArm(mem, st('off', true), 16000).armState).toBe('off');
    expect(holdArm(mem, st('off'), 17000).armState).toBe('off');
    expect(holdArm({ last: null, at: 0 }, st('off', true), 0).armState).toBe('off');
  });
});
