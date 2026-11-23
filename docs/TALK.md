# TALK

The Dock's TALK section (`src/app/(robot)/talk.tsx`): what visitors said to Lumi and what it answered, and the
assistant's errors. Saying words or asking from here (SAY, ASK, quick words) was taken out on 2026-11-23 to come back
later; COMMANDS has SAY and ASK.

## On the screen

- One block in the screen's middle, the same room on both sides: the larger of the modes' room (left) and the task
  card's room (right), so it never runs under either and does not move when a task card comes and goes.
- **Assistant chip:** Listening (green), Talking with someone (blue), Singing (yellow) or Off (dim). Off says
  "Switch on Greeter or Patrol and Lumi listens": the modes on the left switch the assistant (lumi.py) on and off.
  Talking is read from the log: words with no end of the talk since, within 45 s (`TALK_OPEN_S`).
- **Conversation** (`ui/TalkLog.tsx`): newest at the bottom; it follows new lines unless someone has scrolled up. Each
  line has its clock time, who spoke (Visitor, Lumi), an EN or KO mark for the language it was spoken in, and Typed for
  words that came from a typed command. Wake words are dimmed, songs show their title, a divider marks
  "Talk ended at HH:MM". Up to 200 lines are kept while the screen is open (`KEEP_LINES`).
- **ALL WORDS:** also shows what the mics heard that was not meant for Lumi (`heard '...' (no wake word)`).
- **ERRORS:** the assistant log's error lines instead of the conversation, newest on top, selectable. The button turns
  red with a count ("Errors 3") when there are any; a stuck main loop has its own line.
- The volume button on the left edge, as on COMMANDS.

## Robot endpoints (all GET)

| Endpoint | Used for |
|---|---|
| `/assistant/log?lines=600` | `{lumi_log: [lines], console: [lines]}`: the conversation, parsed in `lib/talk.ts` |
| `/assistant/status` | `{errors: [lines], stuck, running, ...}`: ERRORS |
| `/songs` | `{songs: [{id, title, title_ko}], singing}`: Singing and the songs' titles |

They are read every 3 s while TALK is open and the app is in front, one read at a time (`lib/useTalk.ts`,
`TALK_POLL_MS`). Both log endpoints read the end of `logs/lumi.log` only since Thor `8829b9d` (`api/server.py tail`):
the log is near 1 GB and reading it whole took about 6 s a call; now 0.04 s.

### Log lines read (`parseTalkLog`)

```
HH:MM:SS WAKE 'Lumi.': voice at ...
HH:MM:SS visitor #31: <words>  [korean, confidence -0.2]
HH:MM:SS lumi (3.2 s, voice after 2.4 s): <answer>
  goodbye: <words>
  heard '<words>' (no wake word)
  singing <SONG_ID>
dashboard: heard            (the next words were typed)
person #N left - stop talking / conversation over ...
=== YYYY-MM-DD Weekday ===
```

## Proposed robot endpoints (not built)

1. `GET /talk/log?after=<seq>&limit=100` in place of reading `/assistant/log`:
   `{"seq": 1234, "lines": [{"seq", "time", "who": "person"|"lumi", "kind": "words"|"wake"|"overheard"|"song"|"end",
   "text", "lang": "en"|"ko", "typed", "source": "voice"|"say"|"ask"|"mission"}]}`, written by lumi.py and also by
   `/say`, `/ask` and mission say steps (those are not in lumi.log today).
2. `GET /talk/state` for a real Listening / Speaking state instead of the guess from the log:
   `{"running", "listening", "speaking", "saying", "talk_open", "person", "lang", "since_s"}`.
