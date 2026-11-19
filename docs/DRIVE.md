# Camera (the Drive screen)

The manual control station for Lumi's body and base: `src/app/(robot)/drive.tsx`, opened from CAMERA (카메라) in the
dock. The owner renamed the tab from DRIVE on 2026-11-19; the route, the file and the code keep the name drive.
The arm is set up by hand on Commands, ARM SETUP (docs/COMMANDS.md, `src/ui/ArmSetupPanel.tsx`), since 2026-11-19.
Everything here runs against the robot API (lumi-wave `api/server.py`, `api/control.py`); the request bodies below were
read from that code on 2026-11-18.

## What is on the screen

| Part | Where | Endpoint |
| --- | --- | --- |
| Head camera, full screen (what Lumi sees, about 10 pictures a second) | behind everything | `GET /camera/head/latest.jpg`, `GET /camera/head/info` |
| Torso camera, small; tap it to swap the two | right side above the joystick on a tablet, top centre on a phone | `GET /camera/torso/latest.jpg`, `GET /camera/torso/info` |
| Joystick with its slide lock (the same component as Home) | bottom right | `POST /jog {axis: base_drive or base_turn, direction, speed}`, `POST /jog/stop` |
| Settings button (a gear in a glass ring): opens the body card; shown only while the card is closed. The card is closed whenever the screen is entered (nothing is stored) | bottom centre just above the dock | |
| Body card: one row of four small glass modules, L (lift) down / up, W (waist) left / right, H (head) left / right, T (tilt) down / up, each with its letter and value over two joined arrow buttons (drawn 40 px at most, touched over 44 px; red while held); screen readers say the full names. A tap anywhere outside the card closes it and stops a hold | bottom centre over the dock, where the gear was | hold: `POST /jog {axis: lift, waist, head_yaw, head_pitch}`; release: `POST /jog/stop`; values from `GET /status` (body) |
| Body speed, 5 to 100 %, in a glass row under the axes: its name, small light minus and plus circles (24 px drawn, 44 px touch) round a short track, the percent in bold right after it; drag the track or tap minus / plus for 5 %. The app's own, kept on the device | body card | sent as `speed` = percent / 100 in `/jog` |

The shared controls stay on top as on every screen: STOP bottom left (`POST /stop`, which also stops every jog), the
modes above it, the dock bottom centre, the battery top right with head, waist and lift under it, the status top left
and the body and arm chips top centre (the body chip there enables or disables the body; Drive has no chip of its own
since 2026-11-19). Home's camera button is not on Drive: it belongs to Home's camera panel
(`ui/CameraPanel.tsx`), and Drive shows both cameras all the time.

Buttons whose part cannot move now are dimmed; a touch on one says why (enable the body first, body off). Values
that are not known are left out, never shown as a placeholder.

## /jog as the robot does it (`api/control.py`, for Drive and ARM SETUP)

- Body `{axis, direction: +1 or -1, speed: 0.05 to 1}`; axes `base_drive`, `base_turn`, `lift`, `waist`, `head_yaw`,
  `head_pitch`, `j1` to `j6`, `tcp_x`, `tcp_y`, `tcp_z`. An unknown axis is HTTP 400.
- `j1` to `j6` and `tcp_*` are scaled by the robot's global arm speed (`/arm/speed`), so the app sends them with
  speed 1 when the robot has it. `tcp_x` +1 forward, `tcp_y` +1 left, `tcp_z` +1 up, in the arm's base frame.
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

## Hold to move, safely (`lib/jog.ts`, `ui/useJogHold.ts`, `ui/HoldButton.tsx`; the same on ARM SETUP)

A hold sends `/jog` at once and then every 150 ms. It ends, with one `/jog/stop`, when:

- the finger lifts or the touch is taken away;
- a second finger touches the screen (React Native gives it to the held button, even one on STOP);
- the screen is left for another section (Tabs keep the screen alive, so this is the blur, not an unmount), and when it
  goes away;
- the app leaves the foreground;
- STOP is pressed;
- the robot refuses it (HTTP 409 busy), or 3 calls in a row go unanswered (1 s each): the note says why.
  A failed step the robot reports (the arm controller drops out now and then, a move it refuses) does not end the
  hold: the note says so once and the calls go on, since the robot tries the next step itself. Until 2026-11-19 one
  failed step ended the hold, which is why holding X / Y / Z moved the arm only a moment (`createJogHold`, tested);
- the held button goes away or its part can no longer move (on ARM SETUP also: switching JOINTS and HAND, picking
  another joint, tapping a pose, SAVE, STOP ARM, another Commands group).

At most one `/jog` call is on its way at a time, so a slow network skips calls instead of piling them up, and no late
call can arrive after the stop. If a call was still on its way at the release, a second stop follows once it arrived.
A press is taken only while the screen is shown, the app is in front and one finger is down. Even when the app fails
to send a stop, the robot stops the axis by itself 0.35 s after the last call.

## Speed (`lib/speed.ts`, `ui/SpeedSlider.tsx`, `ui/useDriveSpeed.ts`; the arm's is on ARM SETUP)

The slider is the screen's own (the touch responder, as the joystick): drag anywhere on the track, the value is whole
percents; minus and plus move 5 %. The value math (clamp, snap to 1 %, position to value and back, the robot reply)
is in `lib/speed.ts` with unit tests. The arm's value (ARM SETUP) is the robot's: read on opening the group
(retried every 5 s while it does not answer), sent when the finger lifts, and read again after a refusal so the
slider shows what the robot has. The body's is kept in AsyncStorage (`lumi.drive.bodySpeed`, 50 % at first).

Robot API (2026-11-19): `GET /arm/speed` and `POST /arm/speed {percent}` answer `{percent, min, max}`, 400 with
`detail` out of range. `POST /arm/teach {name}` answers `{ok, name, joints}`, 409 for a built in pose's name, 400 for a
bad name. `GET /arm/poses` lists the saved poses too; `GET /arm/poses/saved` only those. `DELETE /arm/poses/{name}`:
409 for a built in pose, 404 unknown.

## Layout (`lib/driveLayout.ts`)

Tablet 1280 × 800 and phone on its side 844 × 390 are both covered by unit tests. The body card (`bodyCard`) is a
translucent dark rounded card centred over the dock between the modes and the joystick, so it never covers STOP, the
joystick or the dock: one row of the four axes (two joined hold buttons each, the letter and value above), and under
it the speed row. The buttons are drawn 34 to 40 px (as big as the room under the small camera allows) and touched
over 44 px; on a phone with a notch the card is about 360 px wide and 122 px high, which keeps it under the small
camera. The card is dark glass: a translucent dark fill, a fine light edge, a soft sheen at the top (`expo-linear-gradient`), a deep shadow. It opens like a genie out of a
lamp: it starts as the gear (its size, on its centre, `genieStart`) and grows up and out with a soft spring (about
300 ms, a little overshoot, the height following the width); closing shrinks it back into the gear in 240 ms, then
the gear shows again (react-native-reanimated, on the UI thread). The small camera sits on
the right between the readings and the joystick when that leaves a picture at least 80 px high, else top centre under
the chips.

A suggestion for the shared layout (not changed here, to keep `_layout.tsx` edits to the one Tabs line): hide the
head, waist and lift readings on `/drive` (`hideReadings={camera || path === '/drive'}`), since the body card shows
them, which would give the small camera more room on the right.
