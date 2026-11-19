# The Commands screen

The Dock's **COMMANDS** opens `src/app/(robot)/commands.tsx`. Everything Lumi can do is one tap, or a tap and a small
choice (which object, which marker). It replaces the buttons of the old web dashboard (`~/Dev/lumi-wave/api/dashboard.html`
on the Thor) and talks to the same lumi-api (`api/server.py`, port 8100). The request building and the reply reading
are plain functions in `src/lib/commands.ts`, tested in `src/lib/__tests__/commands.test.ts`.

## Layout

- The content sits in the free middle of the screen: right of the modes (Greeter, Patrol, Wave, Welcome stay on the
  left: most commands need one of them), left of the readings, or of the task card while a task runs, under the power
  chips and above the Dock. STOP (bottom left), the Dock, the battery and the task card stay on top, as on every screen.
- **Groups** on top: ARM & OBJECTS, MOVING, TALKING, MISSIONS. One group's tiles show at a time, so a phone
  (landscape, about 844 × 390) fits them; the tile grid scrolls.
- **The status line** under the groups: how the last tap went (sending, Lumi is on it, the assistant does it, done,
  refused and the robot's reason, Lumi did not answer). For "Move it aside" it follows `/skills/state` (working, done,
  refused with its reason). With no tap yet it shows the running task's step. An `/ask` answer is shown under it.
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
- **Move aside** lists only what the torso camera sees now within reach (`seenThings`: 850 mm from the
  arm's base, 1500 mm with Patrol on, when the base may drive closer), read again every second while the list is open.
  A tap on a name starts it at once: no GO and no second question (the owner, 2026-11-19). Further "objects" were
  mostly something else (a blue chair 2.4 m away read as a blue cup, and the pick was refused out of reach).
- **Anything that moves the arm or the base asks first** in `ConfirmDialog` with a sentence ("Pick up the blue cup?",
  "Drive 0.5 m forward?"). The head, speech, songs and the volume do not ask.
- Every word is in `src/lib/i18n.tsx` (keys `cmd*`, `obj*`, `col*`), English and Korean.

## Actions and their endpoints

| Group | Tile | Choice | Sends | Needs |
|---|---|---|---|---|
| Arm & objects | Pick up | object | `POST /tasks/steps` `[{do: pick, object, colour}]` (as voice reads "pick up the cup") | Greeter or Patrol, arm, empty hand |
| | Put it down | | `POST /tasks/place` `{on: null}` | Greeter or Patrol, arm, holding |
| | Hand it over | | `POST /tasks/give` | Greeter or Patrol, arm, holding |
| | Take from me | object | `POST /tasks/steps` `[{do: receive, object, from_hand: true}]`; Release (task card or Missions) or "okay" closes the hand | Greeter or Patrol, arm, empty hand |
| | Move it aside | object | `POST /skills/move` `{object, colour}`, watched on `GET /skills/state` | arm, empty hand |
| | Wave | | `POST /arm/wave` (answers when done; follows the global arm speed) | arm |
| | Arm pose | pose | `POST /arm/pose` `{name}` (answers when there; the robot's global arm speed, set on Drive, applies) | arm |
| | Open hand / Close hand | | `POST /gripper/open`, `POST /gripper/close` | arm |
| Moving | Come here | | `POST /tasks/command` `{text: "come here"}` | Patrol |
| | Follow me | | `POST /tasks/command` `{text: "follow me"}` | Patrol |
| | Go to | marker | `POST /agv/go` `{marker}` | |
| | Go charge | | `POST /agv/go` `{marker: "home"}` | |
| | Fetch | object, from (here or a marker), to (here or a marker), there: keep holding or put on a table | `POST /tasks/fetch` `{object, colour, source, dest, finish}` | Patrol, arm, empty hand |
| | Carry it | marker, then: keep holding, put on a table, hand it over | `POST /tasks/carry` `{dest: {marker}, then, on: null}` | Patrol, arm, holding |
| | Drive | forward / back / left / right, 0.5, 1 or 2 m | `POST /tasks/steps` `[{do: move, dir, m}]` | Patrol |
| | Turn | left 90°, right 90°, around | `POST /tasks/steps` `[{do: turn, deg}]` (+ = left) | Patrol |
| | Look | left, right, up, down, ahead | `POST /head/turn` `{yaw, pitch}` (+yaw = left 40°, up = pitch 20°, down and ahead = pitch −5°, the rest) | |
| Talking | Say | text | `POST /say` `{text}`; while the assistant runs (it owns the speaker and `/say` is refused) a mission `[{do: say, text}]` | |
| | Ask | text | `POST /ask` `{question, speak: true}` (the answer is shown too); while the assistant runs `POST /tasks/command` with the question | |
| | Sing | any song, or a title | today `POST /tasks/command` `{text: "sing a song"}` or `"sing <title>"`; with the proposed `/sing` `POST /sing` `{id}` | Greeter or Patrol (not with `/sing`) |
| | Volume | − / + in steps of 10 % | `GET /volume`, `POST /volume` `{percent}` | |
| Missions | Type a command | free text, or an example | `POST /tasks/parse` `{text, llm: false}` 0.6 s after typing stops, `llm: true` on Enter (nothing moves); START sends what it read: `steps` → `/tasks/steps`, `fetch` → `/tasks/fetch`, `carry` → `/tasks/carry`, `give` → `/tasks/give`, `place` → `/tasks/place`, `command` → `/tasks/command` (exactly as the dashboard's Command dialog) | what the robot says in `problems` |
| | Pause / Resume / Release / Stop | | `POST /tasks/pause`, `/tasks/resume`, `/tasks/release`, `/tasks/stop` | a task that offers it (`taskButtons`) |

"Needs" is what the robot itself checks (`_switches`, `robot_free`, `steps.check` in `api/server.py`): a task needs
Greeter or Patrol on, anything that drives or turns the base or the waist needs Patrol. Hand controls (wave, poses,
gripper, head, skills) are refused while something runs (`Busy with a task. Pause or stop it first.`).

The typed command box shows the robot's reading in English (`sentence`, the robot has no Korean one), a mission's
steps one per line in the app's language (`stepLine`), and the robot's problems; START is enabled only when there is
an action and no problem. Moves are asked first; answers, songs and "stop" are not (`parsedMoves`).

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
