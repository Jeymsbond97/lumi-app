import { createJogHold, holdAllowed, JOG_EVERY_MS, type JogCommand, type JogDeps } from '../jog';

const UP: JogCommand = { axis: 'head_pitch', direction: 1, speed: 0.5 };
const LEFT: JogCommand = { axis: 'waist', direction: 1, speed: 0.5 };

class Busy extends Error {}

/** A robot whose /jog replies the test settles by hand. */
function robot() {
  const pending: { cmd: JogCommand; resolve: (e: string | null) => void; reject: (e: unknown) => void }[] = [];
  const stops: number[] = [];
  const fails: string[] = [];
  const changes: (JogCommand | null)[] = [];
  const deps: JogDeps = {
    send: (cmd) => new Promise((resolve, reject) => pending.push({ cmd, resolve, reject })),
    stop: () => {
      stops.push(Date.now());
      return Promise.resolve();
    },
    isBusy: (e) => e instanceof Busy,
    onFail: (why) => fails.push(why),
    onChange: (c) => changes.push(c),
  };
  return { deps, pending, stops, fails, changes };
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

  it('a failed call ends the hold, sends a stop and says no answer', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    r.pending[0].reject(new Error('timeout'));
    await settle();
    expect(hold.held()).toBeNull();
    expect(r.stops).toHaveLength(1);
    expect(r.fails).toEqual(['noAnswer']);
    jest.advanceTimersByTime(10 * JOG_EVERY_MS);
    expect(r.pending).toHaveLength(1);
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

  it('a failed step the robot reports ends the hold', async () => {
    const r = robot();
    const hold = createJogHold(r.deps);
    hold.press(UP);
    r.pending[0].resolve('head_pitch: body disabled');
    await settle();
    expect(r.fails).toEqual(['refused']);
    expect(r.stops).toHaveLength(1);
    expect(hold.held()).toBeNull();
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
