import { stepText, taskButtons, toModes, toTaskState, type TaskState } from '../api';
import { taskToShow, type TaskMemory } from '../robot';

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
