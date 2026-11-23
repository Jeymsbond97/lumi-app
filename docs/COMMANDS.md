# The Commands screen

The Dock's **COMMANDS** opens `src/app/(robot)/commands.tsx`. Everything Lumi can do is one tap, or a tap and a small
choice (which object, which marker). It replaces the buttons of the old web dashboard (`~/Dev/lumi-wave/api/dashboard.html`
on the Thor) and talks to the same lumi-api (`api/server.py`, port 8100). The request building and the reply reading
are plain functions in `src/lib/commands.ts`, tested in `src/lib/__tests__/commands.test.ts`.

## Layout

- The content sits in the free middle of the screen: right of the modes (Greeter, Patrol, Wave, Welcome stay on the
  left: most commands need one of them), left of the readings, or of the task card while a task runs, under the power
  chips and above the Dock. STOP (bottom left), the Dock, the battery and the task card stay on top, as on every screen.
- **Groups** on top: ARM & OBJECTS, MISSIONS, ARM SETUP. One group's tiles show at a time, so a
  phone (landscape, about 844 × 390) fits them; the tile grid scrolls. ARM SETUP shows the arm settings panel instead
  of tiles (below). ARM & OBJECTS holds the main commands, most used first (Go charge, Wave, Sing, Follow me, Go to,
  then the rest), with all of the old MOVING and TALKING groups (owner, 2026-11-23).
- **The joystick** (`ui/Joystick.tsx`, as on Home) sits bottom right; the tiles keep its width free on the right
  (owner, 2026-11-23).
- **Choices** (Go to, Fetch, Carry, Turn, Look, Sing, ...) open as a card in the middle of the screen with the options
  as tiles; Cancel and Go are the same size. A choice of markers reads `GET /agv/markers` again every 3 s while it is
  open, so a marker just added, or the markers of a new map, show at once; the charger (`home`) comes first as
  Charger.
- **The status line** under the groups: how the last tap in that group went (sending, Lumi is on it, the assistant
  does it, done, refused and the robot's reason, Lumi did not answer); each group keeps its own, so ARM SETUP's taps
  never show on Arm & objects. For "Move object" it follows `/skills/state` (working, done, refused with its reason).
  "Done" stays 4 s (`DONE_SHOWN_MS`), then the line goes back to the running task's step, as with no tap yet. An `/ask`
  answer is shown under it and stays.
- **A tile that can't run now** is dimmed; tapping it says why instead of sending (switch on Greeter or Patrol,
  switch on Patrol, enable the arm, Lumi holds something, Lumi is not holding anything). The robot checks again
  anyway and its refusal is shown the same way.
- **Choices** open in a dark sheet at the top of the free area (the keyboard does not cover it): chips per field,
  GO. Objects come from `GET /objects` (what the torso camera sees now, marked "seen now", nearest first) followed by
  every object Lumi knows in any colour; markers from `GET /agv/markers`; poses from `GET /arm/poses`; songs from
  `GET /songs` (proposed below).
- **Pick up is typed**: a field takes what to take ("blue cup", "파란 컵"), read in English and Korean by
  `parseThing` (an object Lumi can take, a colour if one is named); SEND starts it at once. Under the field the
  things seen near now (below) are offered as one tap words.
- **Move object** lists only what the torso camera sees now within reach (`seenThings`: 850 mm from the
  arm's base, 1500 mm with Patrol on, when the base may drive closer), read again every second while the list is open.
  A tap on a name starts it at once: no GO and no second question (the owner, 2026-11-19). Further "objects" were
  mostly something else (a blue chair 2.4 m away read as a blue cup, and the pick was refused out of reach).
- **Anything that moves the arm or the base asks first** in `ConfirmDialog` with a sentence ("Pick up the blue cup?",
  "Drive 0.5 m forward?"). The head, speech, songs and the volume do not ask.
- Every word is in `src/lib/i18n.tsx` (keys `cmd*`, `obj*`, `col*`), English and Korean.

## Actions and their endpoints

| Group | Tile | Choice | Sends | Needs |
|---|---|---|---|---|
| Arm & objects | Go charge | | `POST /agv/go` `{marker: "home"}`: the Thor drives to the charger marker named Home (any case), else the map's first charger marker (lowest dock number), so a new map's charger is Go charge as soon as it is marked; other chargers (charge, dock2) keep their names (Thor `robot/agv.py dock_marker`) | |
| | Wave | | `POST /arm/wave` (answers when done; follows the global arm speed). With Greeter or Patrol on Lumi says a hello as the hand comes up (Thor `tasks/wave_lines.py` ASKED, English or Korean at random); both off: a silent wave | arm |
| | Sing | any song, or a title | today `POST /tasks/command` `{text: "sing a song"}` or `"sing <title>"`; with the proposed `/sing` `POST /sing` `{id}` | Greeter or Patrol (not with `/sing`) |
| | Follow me | | `POST /tasks/command` `{text: "follow me"}` | Patrol |
| | Go to | marker | `POST /agv/go` `{marker}` | |
| | Come here | | `POST /tasks/command` `{text: "come here"}` | Patrol |
| | Pick up | object | `POST /tasks/steps` `[{do: pick, object, colour}]` (as voice reads "pick up the cup") | Greeter or Patrol, arm, empty hand |
| | Give | | `POST /tasks/give` (arm to the `give` pose) | Greeter or Patrol, arm, holding |
| | Take | object | `POST /tasks/steps` `[{do: receive, object, from_hand: true}]` (open hand held out in the `give` pose); Release (task card or Missions) or "okay" closes the hand | Greeter or Patrol, arm, empty hand |
| | Put it down | | `POST /tasks/place` `{on: null}` | Greeter or Patrol, arm, holding |
| | Fetch | object, from (here or a marker), to (here or a marker), there: keep holding or put on a table | `POST /tasks/fetch` `{object, colour, source, dest, finish}` | Patrol, arm, empty hand |
| | Carry it | marker, then: keep holding, put on a table, hand it over | `POST /tasks/carry` `{dest: {marker}, then, on: null}` | Patrol, arm, holding |
| | Say | text | `POST /say` `{text}`; while the assistant runs (it owns the speaker and `/say` is refused) a mission `[{do: say, text}]` | |
| | Ask | text | `POST /ask` `{question, speak: true}` (the answer is shown too); while the assistant runs `POST /tasks/command` with the question | |
| | Move object (pick it up, put it down at a free spot nearby) | object | `POST /skills/move` `{object, colour}`, watched on `GET /skills/state` | arm, empty hand |
| | Look | left, right, up, down, ahead | `POST /head/turn` `{yaw, pitch}` (+yaw = left 40°, up = pitch 20°, down and ahead = pitch −5°, the rest) | |
| | Turn | left 90°, right 90°, around | `POST /tasks/steps` `[{do: turn, deg}]` (+ = left) | Patrol |
| | Drive | forward / back / left / right, 0.5, 1 or 2 m | `POST /tasks/steps` `[{do: move, dir, m}]` | Patrol |
| | Volume | − / + in steps of 10 % | `GET /volume`, `POST /volume` `{percent}` | |
| Missions | Type a command | free text, or an example | `POST /tasks/parse` `{text, llm: false}` 0.6 s after typing stops, `llm: true` on Enter (nothing moves); START sends what it read: `steps` → `/tasks/steps`, `fetch` → `/tasks/fetch`, `carry` → `/tasks/carry`, `give` → `/tasks/give`, `place` → `/tasks/place`, `command` → `/tasks/command` (exactly as the dashboard's Command dialog) | what the robot says in `problems` |
| | Pause / Resume / Release / Stop | | `POST /tasks/pause`, `/tasks/resume`, `/tasks/release`, `/tasks/stop` | a task that offers it (`taskButtons`) |

"Needs" is what the robot itself checks (`_switches`, `robot_free`, `steps.check` in `api/server.py`): a task needs
Greeter or Patrol on, anything that drives or turns the base or the waist needs Patrol. Hand controls (wave, poses,
gripper, head, skills) are refused while something runs (`Busy with a task. Pause or stop it first.`).

The typed command box stands open at the top of MISSIONS, not as a dialog, with Pause, Resume, Release and Stop
under it (owner, 2026-11-23); CLEAR empties the line, START sends and empties it. It shows the robot's reading in English (`sentence`, the robot has no Korean one), a mission's
steps one per line in the app's language (`stepLine`), and the robot's problems; START is enabled only when there is
an action and no problem. Moves are asked first; answers, songs and "stop" are not (`parsedMoves`).

## ARM SETUP: the arm by hand (`src/ui/ArmSetupPanel.tsx`)

Moved here from the Drive screen (now the CAMERA tab) on 2026-11-19 (the owner: that screen keeps the body, the arm's controls are a settings part of
Commands). Arm pose, Open hand and Close hand left ARM & OBJECTS with it. Laid out as Cobo π's Manual page (the arm's
own teach pendant), in the app's dark panels; the shapes are in `lib/armPad.ts` and `ui/ArmPads.tsx`.

- **Header** (slim): the arm state chip (tap: power on, enable, disable, power off, asked first; `POST /arm/power
  {on}`, `POST /arm/enable {on}`) and STOP ARM (`POST /arm/stop`; always active, red outline, not the main STOP).
- **3D simulation**: the arm alone (no Lumi body, logos hidden) mounted on its side as on Lumi, over a white grid on a mid grey
  ground, RGB triads at its base and its flange, a round XYZ orientation gizmo bottom right: the scene's `arm` view
  (`setState({view: 'arm'})` to `web/home3d.html`, `armSceneState`), in `ui/LumiScene.tsx` as on Home. It is framed on
  a sphere of the arm's whole reach round its shoulder, so every pose stays in the picture. It shows the real arm: the
  joints from `GET /arm/joints` 5 times a second while the arm has power (`useLiveJoints`), gliding between readings.
  The model has no gripper fingers, so the gripper is not drawn. The WebView is mounted only while ARM SETUP shows on
  a focused screen, and its page starts in the arm view (`LumiScene initial`, written into the page as
  `window.LUMI_STATE` before it runs), so Lumi's whole body never flashes first. The card and the page are the simulation's grey from the first paint
  (`LumiScene background`), and the scene fades in over 200 ms once the page has drawn its first frame with the arm
  (its `drawn` message): no black flash. Home's view is unchanged.
- **Joint angles and frame**: the joints go to the model exactly as on Home (the model's angles are the
  controller's), and the arm view draws the arm alone in the controller's own frame, z up, as it is mounted on Lumi:
  on its side, J1 level along x, its base on a plain grey plate and post where the torso holds it, the floor grid
  0.26 m under the base, close under the arm as in Cobo π (a pose that reaches lower passes through the grid's
  lines), and the RGB triad at the controller's base origin (X red, Y green, Z blue
  up, as the gizmo). The frame is fitted to 13 of the controller's own forward kinematics readings (`kine_forward`,
  2026-11-19): the model's arm frame turned a quarter turn about z and 30.4 mm along x puts the flange within 1.1 mm
  of every reading (`flangeMm` in `lib/armFrame.ts`, all 13 in `lib/__tests__/armFrame.test.ts`). The view starts as
  Cobo π's, from the same side as Home's camera (Lumi's front: the arm on the mount's left): a little from above,
  looking slightly down, the arm's usual poses filling about two thirds
  of the height and the grid the lower half. Then it is the person's: orbit, zoom and pan stay exactly where they are
  left (no gliding back, no new framing on new joints or a resize); a double tap frames it again. Home keeps its own
  behaviour (it glides back to the whole robot).
- **TCP read-out** under the 3D view: `X Y Z` in mm and `RX RY RZ` in degrees, one decimal (`GET /arm/state` `tcp`
  every 500 ms while the arm has power; `toTcp`, `tcpParts`). The controller drops its connection for about half a
  second every few seconds, and the robot's own round then reports the arm silent (no joints, and the live joint reads
  pause). On this screen a value once read is never hidden again: a failed read changes nothing, the read-out, the
  joint angles and the 3D arm keep the last good values until a new good read. Only before the first read are they
  empty.
- **JOINTS**: J1 to J6 as Cobo π's quarter rings: the angle on top, the lower left half turns the joint minus, the
  upper right half plus, the joint's name in the ring's corner. Hold: `POST /jog {axis: j1 to j6, speed: 1}` (the
  global arm speed scales it); release: `POST /jog/stop`. The held half turns red.
- **POSES** (a tab beside JOINTS): SAVED poses first with their small red delete control (asked first;
  `GET /arm/poses/saved`, `DELETE /arm/poses/{name}`), then BUILT IN (`GET /arm/poses`; `splitPoses`), in a fixed area
  that scrolls by itself. A tap asks first, then `POST /arm/pose {name}` (`{name, speed: "slow"}` for a robot without
  `/arm/speed`). SAVE names where the arm is now (1 to 24 letters, digits, _ or -) and sends `POST /arm/teach {name}`.
- **SPACE ADJUST**: the Z capsule (Z+ top, Z- bottom) beside the round pad (Y+ top, Y- bottom, X- left, X+ right, a
  small hub). Hold: `POST /jog {axis: tcp_x, tcp_y, tcp_z, speed: 1}` in the arm's base frame (x +1 forward, y +1
  left, z +1 up). Cobo π's rotation pads (RX, RY, RZ) are left out: the robot API has no rotation jog. A robot without
  `/arm/speed` has no straight moves: the pad is dimmed and says so.
- **GRIPPER**: its state (`GET /gripper/state` every 2 s while the arm has power), OPEN and CLOSE
  (`POST /gripper/open`, `/gripper/close`); close asks first, open asks first while it holds something.
- **Speed**: the robot's global arm speed (every arm motion follows it) on Cobo π's ticked scale: the ticks 1, 5,
  20, 50, 100 that fall inside the robot's range are labelled and sit evenly along the track, the value runs linearly
  between two of them (`tickStops`, `tickFraction`, `tickValue`, `tickLabels` in `lib/speed.ts`); the percent in a box
  at the top right. `GET /arm/speed` when the group shows; `POST /arm/speed {percent}` when the finger lifts. A robot
  whose `GET /arm/speed` is 404 gets the Slow, Normal, Fast button instead (0.2, 0.5, 1 as the jog speed).

Controls that cannot act now are dimmed; a touch says why on the status line (enable the arm first, arm off). How
each tap went is on the status line too: the part's name, then done, refused with the robot's reason, or no answer.

Layout (`armSetupLayout` in `lib/arm.ts`):

- **Wide** when the free width is at least 48 text sizes (a tablet): the header across the top; left two thirds the
  3D view with its read-out (about two thirds of the height) over the JOINTS / POSES panel; right third SPACE ADJUST,
  GRIPPER and the speed, one card with quiet section labels. Nothing scrolls but the poses. Holds start at once.
- **Compact** otherwise (a phone on its side, a tablet while the task card is open): the 3D view on the left (40 %,
  STOP ARM on its corner; the arm chip is the shared one in the top bar), the controls in tabs in the middle (JOINTS
  as a sideways strip of rings, POSES, MOVE: the pad and the gripper), the speed as an upright fader on the right,
  always in view (`ui/SpeedFader.tsx`). Because the controls scroll, holds start only once the finger has stayed
  down 120 ms without moving more than 6 px (`createDelayedPress` in `lib/jog.ts`): a scroll that starts on one
  moves nothing, and a quick tap is one short step.

Every touch area is at least 44 px; parts drawn smaller (the rings and the pad on a phone) get the rest as touch
room round them.

## Not offered

- **Lift up / down**: `robot/head.py` holds the lift at 0 mm (`LIFT_MAX_MM = 0.0`) until the head camera has a longer
  cable, so `/body/move` refuses any other lift. A tile can come back when the limit does (`/body/move {lift_mm}`).
- **Teach an object's colour** (`POST /objects/teach`) and the dry run `/skills/plan`: tools for setting up, left to a
  later Settings page.
- **Arm programs** (`POST /arm/run`, `.jks` files): only from look, the dashboard's expert button.

## Singing: what the Thor has and what it needs

Lumi already sings: four songs the owner provided (BAD, Fantastic Baby, 꿈꾸던 어른이 되었나요, Love Attack) in
Lumi's voice with head moves (`audio/sing.py`, `assistant/lumi.py` `sing_song`, docs/14 §Singing). But only the
assistant can start a song, when it hears or is sent words like "sing a song": there is no endpoint to list the songs
or to sing one while the assistant is off. Today the app sends the words through `POST /tasks/command`, which needs
Greeter or Patrol on, and offers only "Any song".

Proposed for `~/Dev/lumi-wave/api/server.py` (not applied; the app already reads `GET /songs` and, when it answers,
offers the titles and uses `POST /sing`):

```python
import random   # with the other imports


class SingBody(BaseModel):
    id: str | None = Field(None, description="a song id from GET /songs; empty = any of them")


_sing = {"thread": None, "stop": threading.Event(), "id": None}


@app.get("/songs", tags=["voice"], summary="The songs Lumi sings: id and title (English, Korean)")
def songs_list():
    from audio import sing
    return {"songs": [{"id": k, "title": s.get("title") or k, "title_ko": s.get("title_ko") or s.get("title") or k}
                      for k, s in sing.songs().items()],
            "singing": _sing["id"] if _sing["thread"] and _sing["thread"].is_alive() else None}


@app.post("/sing", tags=["voice"], summary="Sing a song with head moves; returns at once (STOP or /sing/stop ends it)")
def sing_start(body: SingBody):
    from audio import sing
    all_songs = sing.songs()
    if body.id is not None and body.id not in all_songs:
        raise HTTPException(404, f"no song {body.id}; songs: {list(all_songs)}")
    if assistant_pids():                              # it owns the speaker and the head: it sings, as if it heard it
        title = all_songs[body.id]["title"] if body.id else None
        send_to_assistant("heard", text=f"sing {title}" if title else "sing a song")
        return {"ok": True, "by": "assistant"}
    robot_free(manual=True)                           # not while a task, a wave or a drive runs
    if _sing["thread"] and _sing["thread"].is_alive():
        raise HTTPException(409, "Already singing.")
    song = body.id or random.choice(list(all_songs))
    stop = _sing["stop"] = threading.Event()

    def run():
        try:
            with _voice_lock:
                sing.sing(song, abort=stop.is_set)
        finally:
            _sing["id"] = None

    _sing["id"] = song
    _sing["thread"] = threading.Thread(target=run, daemon=True)
    _sing["thread"].start()
    return {"ok": True, "by": "api", "id": song}


@app.post("/sing/stop", tags=["voice"], summary="Stop the song (music, voice and head)")
def sing_stop():
    _sing["stop"].set()
    return {"ok": True}
```

and in `stop_all()` (STOP) one line next to `_route.stop()`: `_sing["stop"].set()`; and in `running_now()` a song
counts as running (`if _sing["thread"] and _sing["thread"].is_alive(): return "song"`), so hand controls wait for it.
`sing.sing()` already returns the head to the listener's yaw and stops within 50 ms when `abort()` is true.
