import { createDelayedPress, createJogHold, HOLD_DELAY_MS, HOLD_SLOP_PX, holdAllowed, JOG_EVERY_MS, JOG_MISSES, type JogCommand, type JogDeps } from '../jog';

const UP: JogCommand = { axis: 'head_pitch', direction: 1, speed: 0.5 };
const LEFT: JogCommand = { axis: 'waist', direction: 1, speed: 0.5 };

class Busy extends Error {}

/** A robot whose /jog replies the test settles by hand. */
function robot() {
  const pending: { cmd: JogCommand; resolve: (e: string | null) => void; reject: (e: unknown) => void }[] = [];
  const stops: number[] = [];
  const fails: string[] = [];
  const warns: string[] = [];
  const changes: (JogCommand | null)[] = [];
  const deps: JogDeps = {
    send: (cmd) => new Promise((resolve, reject) => pending.push({ cmd, resolve, reject })),
    stop: () => {
      stops.push(Date.now());
      return Promise.resolve();
    },
    isBusy: (e) => e instanceof Busy,
    onFail: (why) => fails.push(why),
    onWarn: (detail) => warns.push(detail),
    onChange: (c) => changes.push(c),
  };
  return { deps, pending, stops, fails, warns, changes };
}

/** Lets the replies' promise callbacks run. */
const settle = () => Promise.resolve().then(() => undefined);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('hold to move', () => {
  it('sends at once, then about every 150 ms while held', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    expect(r.pending).toHaveLength(1);
    for (let i = 0; i < 4; i++) {
      r.pending[i].resolve(null);
      await settle();
      jest.advanceTimersByTime(JOG_EVERY_MS);
    }
    expect(r.pending).toHaveLength(5);
    expect(r.pending.every((p) => p.cmd === UP)).toBe(true);
    expect(hold.held()).toBe(UP);
  });

  it('stops on release: no more calls and one /jog/stop', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    r.pending[0].resolve(null);
    await settle();
    hold.release();
    expect(r.stops).toHaveLength(1);
    expect(hold.held()).toBeNull();
    jest.advanceTimersByTime(10 * JOG_EVERY_MS);
    expect(r.pending).toHaveLength(1);
    expect(r.changes).toEqual([UP, null]);
  });

  it('a release with nothing held sends nothing', () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.release();
    hold.release();
    expect(r.stops).toHaveLength(0);
  });

  it('never has two calls on the way: a slow network skips calls instead of piling them up', () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    jest.advanceTimersByTime(10 * JOG_EVERY_MS);
    expect(r.pending).toHaveLength(1);
  });

  it('stops again once a call still on its way at the release has arrived', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    hold.release();
    expect(r.stops).toHaveLength(1);
    r.pending[0].resolve(null); // this late call kept the axis going 0.35 s more on the robot
    await settle();
    expect(r.stops).toHaveLength(2);
  });

  it('one unanswered call does not end the hold: it goes on', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    r.pending[0].reject(new Error('timeout'));
    await settle();
    expect(hold.held()).toBe(UP);
    expect(r.stops).toHaveLength(0);
    jest.advanceTimersByTime(JOG_EVERY_MS);
    expect(r.pending).toHaveLength(2);
    // an answer in between starts the count again
    r.pending[1].resolve(null);
    await settle();
    jest.advanceTimersByTime(JOG_EVERY_MS);
    r.pending[2].reject(new Error('timeout'));
    await settle();
    expect(hold.held()).toBe(UP);
  });

  it(`${JOG_MISSES} unanswered calls in a row end the hold, send a stop and say no answer`, async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    for (let i = 0; i < JOG_MISSES; i++) {
      r.pending[i].reject(new Error('timeout'));
      await settle();
      jest.advanceTimersByTime(JOG_EVERY_MS);
    }
    expect(hold.held()).toBeNull();
    expect(r.stops).toHaveLength(1);
    expect(r.fails).toEqual(['noAnswer']);
    jest.advanceTimersByTime(10 * JOG_EVERY_MS);
    expect(r.pending).toHaveLength(JOG_MISSES);
  });

  it('a refusal while a task runs says busy', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    r.pending[0].reject(new Busy('busy'));
    await settle();
    expect(r.fails).toEqual(['busy']);
    expect(hold.held()).toBeNull();
  });

  it('a failed step the robot reports keeps the hold going and warns once', async () => {
    // the owner's log: every arm hold ended within a second while still pressed, because one failed step ended it
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    r.pending[0].resolve('tcp_x: controller busy');
    await settle();
    jest.advanceTimersByTime(JOG_EVERY_MS);
    r.pending[1].resolve('tcp_x: controller busy');
    await settle();
    jest.advanceTimersByTime(JOG_EVERY_MS);
    expect(hold.held()).toBe(UP);
    expect(r.pending).toHaveLength(3);
    expect(r.stops).toHaveLength(0);
    expect(r.fails).toEqual([]);
    expect(r.warns).toEqual(['tcp_x: controller busy']);
    hold.release();
    expect(r.stops).toHaveLength(1);
  });

  it('keeps sending every 150 ms for as long as it is held', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    for (let i = 0; i < 40; i++) {
      r.pending[i].resolve(null);
      await settle();
      jest.advanceTimersByTime(JOG_EVERY_MS);
    }
    expect(r.pending).toHaveLength(41);
    expect(r.stops).toHaveLength(0);
  });

  it('a late failure of an ended hold does not end a newer one', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    hold.release();
    hold.press(LEFT); // skipped while the first call is on its way
    r.pending[0].reject(new Error('timeout'));
    await settle();
    expect(hold.held()).toBe(LEFT);
    expect(r.fails).toEqual([]);
    jest.advanceTimersByTime(JOG_EVERY_MS);
    expect(r.pending.at(-1)?.cmd).toBe(LEFT);
  });

  it('another button replaces the held axis without a stop (a stop would stop the base too)', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    r.pending[0].resolve(null);
    await settle();
    hold.press(LEFT);
    expect(r.stops).toHaveLength(0);
    expect(hold.held()).toBe(LEFT);
    expect(r.pending.at(-1)?.cmd).toBe(LEFT);
  });

  it('pressing the held button again does not start a second loop', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    hold.press({ ...UP });
    r.pending[0].resolve(null);
    await settle();
    jest.advanceTimersByTime(JOG_EVERY_MS);
    expect(r.pending).toHaveLength(2);
    hold.release();
    jest.advanceTimersByTime(10 * JOG_EVERY_MS);
    expect(r.pending).toHaveLength(2);
  });
});

describe('holdAllowed', () => {
  it('only on the shown screen, in the foreground, with one finger', () => {
    expect(holdAllowed({ focused: true, foreground: true, touches: 1 })).toBe(true);
    expect(holdAllowed({ focused: false, foreground: true, touches: 1 })).toBe(false);
    expect(holdAllowed({ focused: true, foreground: false, touches: 1 })).toBe(false);
    expect(holdAllowed({ focused: true, foreground: true, touches: 2 })).toBe(false);
  });
});

describe('createDelayedPress', () => {
  const make = () => {
    const calls: string[] = [];
    const p = createDelayedPress({ start: () => calls.push('start'), stop: () => calls.push('stop'), tap: () => calls.push('tap') });
    return { p, calls };
  };

  it('starts the hold only after the finger stayed down, and stops it on lift', () => {
    const { p, calls } = make();
    p.down(10, 10);
    jest.advanceTimersByTime(HOLD_DELAY_MS - 1);
    expect(calls).toEqual([]);
    p.move(12, 11); // a small tremble is still a hold
    jest.advanceTimersByTime(1);
    expect(calls).toEqual(['start']);
    p.up();
    expect(calls).toEqual(['start', 'stop']);
  });

  it('a finger that moves first is a scroll: nothing starts, not even on lift', () => {
    const { p, calls } = make();
    p.down(10, 10);
    p.move(10, 10 + HOLD_SLOP_PX + 1);
    jest.advanceTimersByTime(HOLD_DELAY_MS * 3);
    p.up();
    expect(calls).toEqual([]);
  });

  it('a scroll that takes the touch before the delay starts nothing', () => {
    const { p, calls } = make();
    p.down(0, 0);
    p.cancel();
    jest.advanceTimersByTime(HOLD_DELAY_MS * 3);
    expect(calls).toEqual([]);
  });

  it('a quick tap is one short step', () => {
    const { p, calls } = make();
    p.down(0, 0);
    jest.advanceTimersByTime(40);
    p.up();
    jest.advanceTimersByTime(HOLD_DELAY_MS * 3);
    expect(calls).toEqual(['tap']);
  });

  it('a touch taken away while held stops the hold', () => {
    const { p, calls } = make();
    p.down(0, 0);
    jest.advanceTimersByTime(HOLD_DELAY_MS);
    p.cancel();
    p.up();
    expect(calls).toEqual(['start', 'stop']);
  });
});
