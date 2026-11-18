# Drive

The manual control station for Lumi's whole body: `src/app/(robot)/drive.tsx`, opened from DRIVE in the dock.
Everything here runs against the robot API (lumi-wave `api/server.py`, `api/control.py`); the request bodies below were
read from that code on 2026-11-18.

## What is on the screen

| Part | Where | Endpoint |
| --- | --- | --- |
| Head camera, full screen (what Lumi sees, about 10 pictures a second) | behind everything | `GET /camera/head/latest.jpg`, `GET /camera/head/info` |
| Torso camera, small; tap it to swap the two | right side above the joystick on a tablet, top centre on a phone | `GET /camera/torso/latest.jpg`, `GET /camera/torso/info` |
| Joystick with its slide lock (the same component as Home) | bottom right | `POST /jog {axis: base_drive or base_turn, direction, speed}`, `POST /jog/stop` |
| BODY / ARM page switch | panel, bottom centre over the dock | |
| Body state chip (tap: enable or disable, asked first) | BODY page header | `POST /body/enable {on}` |
| Arm state chip (tap: power on, enable, disable, power off, asked first) | ARM page header | `POST /arm/power {on}`, `POST /arm/enable {on}` |
| Speed chip: Slow, Normal, Fast (0.2, 0.5, 1 of the axis' top speed), one per page | panel header | sent as `speed` in `/jog` |
| LIFT down / up, WAIST left / right, HEAD left / right, TILT down / up, each with its value | BODY page | hold: `POST /jog {axis: lift, waist, head_yaw, head_pitch}`; release: `POST /jog/stop`; values from `GET /status` (body) |
| J1 to J6 (pick one, each shows its angle), then hold minus / plus | ARM page | hold: `POST /jog {axis: j1 to j6}`; release: `POST /jog/stop`; angles from `GET /arm/state` |
| Gripper state, OPEN, CLOSE (close asks first; open asks first while it holds something) | ARM page | `GET /gripper/state` every 2 s, `POST /gripper/open`, `POST /gripper/close` |
| POSE: the taught poses; one is picked, asked first, then the arm goes there slowly | ARM page | `GET /arm/poses`, `POST /arm/pose {name, speed: "slow"}` (answers when the arm is there) |
| STOP ARM | ARM page, always active | `POST /arm/stop` |

The shared controls stay on top as on every screen: STOP bottom left (`POST /stop`, which also stops every jog), the
modes above it, the dock bottom centre, the battery top right with head, waist and lift under it, the status top left
and the body and arm chips top centre. Home's camera button is not on Drive: it belongs to Home's camera panel
(`ui/CameraPanel.tsx`), and Drive shows both cameras all the time.

Buttons whose part cannot move now are dimmed; a touch on one says why (enable the body first, enable the arm first,
body off, arm off). Values that are not known are left out, never shown as a placeholder.

## /jog as the robot does it (`api/control.py`)

- Body `{axis, direction: +1 or -1, speed: 0.05 to 1}`; axes `base_drive`, `base_turn`, `lift`, `waist`, `head_yaw`,
  `head_pitch`, `j1` to `j6`. An unknown axis is HTTP 400.
- Each call keeps the axis going 0.35 s more (`HOLD_S`); the app calls every 150 ms while a finger holds the button.
- One body or arm axis at a time: a new one replaces the last. Base drive and turn may be held together.
- `/jog/stop` clears every axis (the base too) and sends the base a zero speed.
- The body moves in small `moveto` steps (lift 10 mm, waist and head yaw 3°, pitch 2°) inside the jog limits (waist
  ±90°, head yaw ±180°, pitch −5° to 35°, lift 0 to `LIFT_MAX_MM`). The arm moves 2° relative joint steps at up to
  20°/s × speed. A step that has started ends, so a part may go one step further after the release.
- Signs, as on the old dashboard: lift +1 up, waist +1 left, head yaw +1 left, pitch +1 up.
- Refused with HTTP 409 while a task, a skill, a route, a wave or a drive to a marker runs (`robot_free(manual=True)`).
  A paused task allows it.
- A step that fails (a disabled joint, an arm error) is reported once, on the next call, as `{"ok": true, "error": "..."}`.
- Now (2026-11-18) `robot/head.py` has `LIFT_MAX_MM = 0.0` (the head camera's cable is too short), so the lift buttons
  do nothing until that limit is raised. The arm joint jog is not collision checked on the robot (`/arm/pose` is).

## Hold to move, safely (`lib/jog.ts`, `ui/useJogHold.ts`, `ui/HoldButton.tsx`)

A hold sends `/jog` at once and then every 150 ms. It ends, with one `/jog/stop`, when:

- the finger lifts or the touch is taken away;
- a second finger touches the screen (React Native gives it to the held button, even one on STOP);
- the screen is left for another section (Tabs keep the screen alive, so this is the blur, not an unmount), and when it
  goes away;
- the app leaves the foreground;
- STOP is pressed;
- a call fails (no answer within 1 s, HTTP 409 busy) or the robot reports a failed step: the note says why;
- the held button goes away (switching BODY and ARM, picking another joint, opening the pose list) or its part can
  no longer move.

At most one `/jog` call is on its way at a time, so a slow network skips calls instead of piling them up, and no late
call can arrive after the stop. If a call was still on its way at the release, a second stop follows once it arrived.
A press is taken only while the screen is shown, the app is in front and one finger is down. Even when the app fails
to send a stop, the robot stops the axis by itself 0.35 s after the last call.

## Layout (`lib/driveLayout.ts`)

Tablet 1280 × 800 and phone on its side 844 × 390 are both covered by unit tests. The buttons panel is centred over
the dock between the modes and the joystick; on a phone with a notch it is about 380 px wide, so the page rows wrap
if a language needs more room. The small camera sits on the right between the readings and the joystick when that
leaves a picture at least 80 px high, else top centre under the chips.

A suggestion for the shared layout (not changed here, to keep `_layout.tsx` edits to the one Tabs line): hide the
head, waist and lift readings on `/drive` (`hideReadings={camera || path === '/drive'}`), since the BODY page shows
them, which would give the small camera more room on the right.
