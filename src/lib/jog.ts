// Hold-to-move for the body on Drive and the arm on Commands, ARM SETUP (lumi-wave api/control.py, POST /jog):
// - axes: lift, waist, head_yaw, head_pitch (the body), j1 to j6 (the arm joints) and tcp_x, tcp_y, tcp_z (the hand in
//   a straight line, arm base frame: x forward, y left, z up); base_drive and base_turn are the joystick's (lib/drive).
//   Only one body or arm axis moves at a time on the robot: a new one replaces the last.
// - direction +1 or -1, speed 0.05 to 1 of the axis' top speed. The robot scales j1 to j6 and tcp_* by its global arm
//   speed (/arm/speed, lib/speed), so the app sends them with speed 1 when the robot has that speed.
// - each call keeps the axis going for 0.35 s more (HOLD_S), so the app calls about every 150 ms while a finger holds
//   the button, and /jog/stop on release (it stops every axis, the base too).
// - the robot moves the body in small steps (lift 10 mm, waist and head yaw 3 deg, pitch 2 deg) and the arm 2 deg per
//   step; a step that has started ends, so the body or arm may go one step further after a stop.
// - a failed step comes back once as {"ok": true, "error": "..."} on the next call; HTTP 409 while a task runs.
// Signs (the old dashboard's buttons): lift +1 up, waist +1 left, head_yaw +1 left, head_pitch +1 up.
import type { AxisCommand } from './drive';

export type BodyAxis = 'lift' | 'waist' | 'head_yaw' | 'head_pitch';
export type ArmAxis = 'j1' | 'j2' | 'j3' | 'j4' | 'j5' | 'j6';
export const ARM_AXES: ArmAxis[] = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
export type TcpAxis = 'tcp_x' | 'tcp_y' | 'tcp_z';
export const TCP_AXES: TcpAxis[] = ['tcp_x', 'tcp_y', 'tcp_z'];
/** Arm jog speed when the robot has a global arm speed: it scales the jog itself. */
export const ARM_JOG_SPEED = 1;

export interface JogCommand {
  axis: AxisCommand['axis'] | BodyAxis | ArmAxis | TcpAxis;
  direction: 1 | -1;
  /** 0.05 to 1 of the axis' top speed */
  speed: number;
}

/** A call this often keeps the axis going; the robot stops it 0.35 s after the last one. */
export const JOG_EVERY_MS = 150;

/** Why a hold ended by itself. */
export type JogFailure = 'busy' | 'noAnswer' | 'refused';
/** Calls in a row that may go unanswered before a hold gives up (the robot stops by itself 0.35 s after the last). */
export const JOG_MISSES = 3;

export interface JogDeps {
  /** One /jog call; resolves with the error the robot reports for an earlier step, or null. */
  send: (cmd: JogCommand) => Promise<string | null>;
  /** A failed call that means the robot refused hand control (a task runs). */
  isBusy?: (e: unknown) => boolean;
  /** /jog/stop */
  stop: () => Promise<unknown>;
  /** The hold ended without the finger lifting: the robot is busy, or calls went unanswered JOG_MISSES times in a row. */
  onFail?: (why: JogFailure, detail?: string) => void;
  /** The robot reported a failed step; the hold goes on (the robot tries the next step itself). Once per hold. */
  onWarn?: (detail: string) => void;
  /** The held command changed (null: nothing is held); for the buttons' look. */
  onChange?: (cmd: JogCommand | null) => void;
  everyMs?: number;
}

export interface JogHold {
  /** A finger went down on a button: move this axis until release. */
  press: (cmd: JogCommand) => void;
  /** The finger lifted (or anything else that must end the hold: a second finger, leaving the screen, the
   *  background, STOP). Sends /jog/stop when something was held. */
  release: () => void;
  held: () => JogCommand | null;
}

/**
 * The hold loop. At most one /jog call is on its way at a time: a slow network then skips calls instead of piling them
 * up, and no old call can arrive after the stop and start the axis again. If one was still on its way at the release,
 * a second stop follows once it has arrived.
 */
export function createJogHold(deps: JogDeps): JogHold {
  const every = deps.everyMs ?? JOG_EVERY_MS;
  let cmd: JogCommand | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight = false;
  let stopAfterFlight = false;
  /** Counts holds, so a reply from an earlier hold does not end a newer one. */
  let generation = 0;
  /** Unanswered calls in a row, and whether this hold has warned of a failed step. */
  let misses = 0;
  let warned = false;

  const sendStop = () => {
    deps.stop().catch(() => {});
  };

  const end = (): boolean => {
    clearInterval(timer);
    timer = undefined;
    const was = cmd !== null;
    cmd = null;
    generation += 1;
    if (was) deps.onChange?.(null);
    return was;
  };

  const fail = (why: JogFailure, detail?: string) => {
    if (!end()) return;
    sendStop();
    deps.onFail?.(why, detail);
  };

  const tick = () => {
    if (!cmd || inFlight) return;
    const mine = generation;
    inFlight = true;
    deps.send(cmd).then(
      (reported) => {
        inFlight = false;
        if (stopAfterFlight) {
          stopAfterFlight = false;
          sendStop();
        }
        if (mine !== generation) return;
        misses = 0;
        // a failed step (the arm controller drops out now and then, a move it refuses) does not end the hold: the
        // robot goes on trying while the calls come, and stops by itself on release
        if (reported && !warned) {
          warned = true;
          deps.onWarn?.(reported);
        }
      },
      (e) => {
        inFlight = false;
        if (stopAfterFlight) {
          stopAfterFlight = false;
          sendStop();
        }
        if (mine !== generation) return;
        if (deps.isBusy?.(e)) return fail('busy');
        misses += 1;
        if (misses >= JOG_MISSES) fail('noAnswer');
      },
    );
  };

  const release = () => {
    if (!end()) return;
    sendStop();
    if (inFlight) stopAfterFlight = true;
  };

  return {
    press(next) {
      if (cmd && cmd.axis === next.axis && cmd.direction === next.direction) return;
      if (cmd) {
        end(); // the robot swaps the body or arm axis by itself; no stop in between (it would stop the base too)
      }
      cmd = next;
      misses = 0;
      warned = false;
      deps.onChange?.(next);
      tick();
      timer = setInterval(tick, every);
    },
    release,
    held: () => cmd,
  };
}

/** A hold may go on only while the screen is shown, the app is in front and one finger is down. */
export const holdAllowed = (s: { focused: boolean; foreground: boolean; touches: number }): boolean =>
  s.focused && s.foreground && s.touches <= 1;

/** The three arm speeds of a robot without /arm/speed, as a share of the axis' top speed. */
export const SPEEDS = { slow: 0.2, normal: 0.5, fast: 1 } as const;
export type SpeedName = keyof typeof SPEEDS;

/** A hold inside a scrolling list starts only once the finger has stayed down this long without moving. */
export const HOLD_DELAY_MS = 120;
/** How far the finger may move before the hold starts and still count as a hold, not a scroll. */
export const HOLD_SLOP_PX = 6;

export interface DelayedPress {
  down: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  /** The finger lifted. */
  up: () => void;
  /** The touch was taken away (a scroll) or a second finger came. */
  cancel: () => void;
}

/**
 * A hold button inside a ScrollView: the scroll takes the touch only after the finger has moved, so a hold that
 * started at once would move the part until then. This starts it after `delayMs` with the finger still (`start`);
 * a move past `slopPx` first is a scroll and starts nothing. A tap that lifts before then is one short step (`tap`).
 */
export function createDelayedPress(deps: {
  start: () => void;
  stop: () => void;
  tap: () => void;
  delayMs?: number;
  slopPx?: number;
}): DelayedPress {
  const delay = deps.delayMs ?? HOLD_DELAY_MS;
  const slop = deps.slopPx ?? HOLD_SLOP_PX;
  let state: 'idle' | 'pending' | 'held' = 'idle';
  let origin = { x: 0, y: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    down(x, y) {
      clear();
      origin = { x, y };
      state = 'pending';
      timer = setTimeout(() => {
        timer = undefined;
        state = 'held';
        deps.start();
      }, delay);
    },
    move(x, y) {
      if (state !== 'pending') return;
      if (Math.hypot(x - origin.x, y - origin.y) > slop) {
        clear();
        state = 'idle';
      }
    },
    up() {
      const was = state;
      clear();
      state = 'idle';
      if (was === 'pending') deps.tap();
      if (was === 'held') deps.stop();
    },
    cancel() {
      const was = state;
      clear();
      state = 'idle';
      if (was === 'held') deps.stop();
    },
  };
}
