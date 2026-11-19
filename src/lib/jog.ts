// Hold-to-move for the body and the arm on Drive (lumi-wave api/control.py, POST /jog):
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

export interface JogDeps {
  /** One /jog call; resolves with the error the robot reports for an earlier step, or null. */
  send: (cmd: JogCommand) => Promise<string | null>;
  /** A failed call that means the robot refused hand control (a task runs). */
  isBusy?: (e: unknown) => boolean;
  /** /jog/stop */
  stop: () => Promise<unknown>;
  /** The hold ended without the finger lifting: a call failed or the robot reported a failed step. */
  onFail?: (why: JogFailure, detail?: string) => void;
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
        if (reported && mine === generation) fail('refused', reported);
      },
      (e) => {
        inFlight = false;
        if (stopAfterFlight) {
          stopAfterFlight = false;
          sendStop();
        }
        if (mine === generation) fail(deps.isBusy?.(e) ? 'busy' : 'noAnswer');
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
