# The Map screen

The Dock's **MAP** opens `src/app/(robot)/map.tsx`. It shows the robot's current map and Lumi on it, and does what the
base's own web page does, through lumi-wave's `/map/*` endpoints (Thor `docs/05_AGV_BASE.md` §6). Home stays mounted
while Map is open (Tabs in `src/app/(robot)/_layout.tsx`), so going back does not reload the 3D scene.

## Layout

- **Navbar** at the top: CONTROL, MARKERS ▾, LINES ▾, POSITION, MAPPING, MAPS ▾, VIEW ▾, BASE ▾, SETTINGS. SETTINGS
  says "Coming soon" for now. Where the words do not fit (a phone, about 844 px wide) the navbar shows its icons only
  (the full navbar is measured out of sight); an open list then starts with its item's name.
- **The frame**: the map sits in a rounded frame between the navbar and the Dock, whatever its size. It starts fitted
  to the frame. **+ / −** (bottom right, outside the frame so a moving finger can't cancel the press) zoom 1.5× about
  the centre, from the whole map up to 8×. Two fingers pinch, one finger drags; a touch that moves less than 8 px is a
  tap. At least 80 px of the map always stays in the frame.
- **Lumi** is drawn at its true size (base 510 × 510 mm, `LUMI_BASE_M`) as a green rounded square with an arrow to its
  front, so doors and passages read at their real width. Never smaller than 6 px.
- **Markers**: a dot and an arrow for the heading Lumi takes there, the name above. Grey, the charger's marker blue,
  the selected one red.
- **Bottom bar**: the target (a marker or a tapped point) with GO and SAVE, or SET POSITION while correcting.

## What it does

| Action | How | Robot |
|---|---|---|
| Send Lumi | tap a marker (or MARKERS ▾) or a point, GO | `/agv/go`, `/agv/go_point` |
| Save a marker | MARKERS ▾ → + Add marker (at the top; where Lumi is), or a tapped point → SAVE; name: letters, digits, `_`, `-` | `/map/marker` |
| Edit a marker | MARKERS ▾ → ✎: a new name (saved again under it, then the old one deleted), MOVE TO LUMI, DELETE; a charger's marker stays one (type 11) and its delete warns that Lumi then cannot dock | `/map/marker`, `/map/marker/delete` |
| Drive a route | the ROUTE pill in the map's top left corner opens a card there (a tap on its title closes it): + Add stop ▾ or tap markers on the map, in order; Wait (s, 0 = no wait), Loop there and back, Times (0 = until stopped; needs Greeter or Patrol on), START; the bar shows 2/4 and the stop; CANCEL | `/agv/route` (one marker: `/agv/go`), `GET /agv/route`, `/agv/cancel` |
| Switch maps | MAPS ▾ → a map, confirm; reloads after 15 s; correct the position after | `/map/switch` |
| Drive by hand | CONTROL shows the joystick | `/jog` |
| Make a new map | MAPPING: a name, confirm, then drive with the joystick while the map grows; SAVE or STOP (see below) | `/map/scan/*` |
| See more on the map | VIEW ▾: Follow Lumi, Laser, Trail, Planned path (see below) | `/map/scan`, `/status`, `/agv/plan` |
| Read the base | BASE ▾: state, target, E-stop, fault, speed, ultrasonic, infrared | `/status` base, `/agv/sensors` |
| Pause a drive | E-STOP (next to STOP): the base halts where it is; RESUME goes on with the same drive or route | `/agv/estop` |
| No-go lines | always drawn in red. LINES ▾ → + New line: each tap on the map is a point (UNDO, CLEAR, CANCEL), SAVE (2 points or more) asks a name; a line's name lights it up; ✎ renames (saved anew, old deleted) or deletes | `/map/info` `lines`, `/map/line`, `/map/line/delete` (base `/forbidden_manager/action_service` list_lines, add_lines, delete_lines over rosbridge) |

## VIEW and BASE (the base page's top bar)

The base's own page (:9001, `js/compress/nav2d.min.yunhai.js`) has in its top bar: track, laser, ultrasonic,
infrared, 4g, position correction, markers, no-go lines, zones, routes, control, measure, global path, particle cloud,
partial map update, fall prevention, log, other, soft E-stop. The app has the useful ones:

- **VIEW ▾** (switches; they stay as set while the app runs):
  - **Follow Lumi** (the page's *track*): Lumi stays in the middle of the frame; + / − keep it there; a drag or a
    pinch of the map ends it ("Follow is off").
  - **Laser** (the page's *laser*): what the lidar sees now (`/map/scan`, once a second) as red dots at Lumi's pose.
    While POSITION is open its own red and purple dots show instead.
  - **Trail**: where Lumi drove on this map. The app keeps it itself from the pose of `/status` (once a second, a
    point every 5 cm, a new piece after a jump over 1.5 m such as a set position, the last 1500 points); another map
    (or a new map being made) starts a new trail. *Clear trail* empties it.
  - **Planned path** (the page's *global path*, topic `/move_base/NavfnROS/plan`): the base's path to its goal, blue
    and dashed, while it drives (`/agv/plan`, once a second).
- **BASE ▾** (read only, while it is open): the state (idle, driving, docking, arrived, held by E-STOP, the red
  button pressed on Lumi), the target marker, E-stop (off, E-STOP, button on Lumi), the base's fault code
  (`error_code` other than `00000000`), and from `/agv/sensors` once a second: speed and turn, ultrasonic and infrared
  ranges per sensor (left 1, front, right 1, back, ...; red under 1 m as on the base's page; "Nothing near" when a
  sensor sees nothing in range).

Without the lumi-wave update below, Planned path says "Needs an update on the robot" and switches itself off, BASE
shows the state from `/status` and says that speed, ultrasonic and infrared need the update, and E-STOP says so too.

Left out on purpose: **4g** (the page draws the cellular signal recorded at each marker; Lumi runs on the robot
Wi-Fi), **zones**, **routes (beta)**, **measure**, **particle cloud**, **partial map update**, **fall prevention**,
**log** and **other** (deployment and service tools, not for a tablet), and the base's **settings** (max speed is
set before every drive by lumi-wave itself, `agv.max_speed`; a setting here would fight the tasks).

On 2026-11-18 (Lumi on its charger) the ultrasonic and infrared topics (`/water_uavcan_master/rx_in_ultrasonic`,
`rx_in_ultrasonic_ex`, `rx_in_ir_v2`) sent nothing within 6 s; `/robot_status` (with `velocity`) and `/scan` did. So
the sensor lists may stay at "No readings" on this base.

## E-STOP

E-STOP sits right of STOP, clear of its glow ring (`src/ui/EstopButton.tsx`, in the shared layout): on the Map always, on every other screen
while Lumi drives or is held, so a held Lumi can always be released from wherever the app is.

- **E-STOP** (red ring, a pause sign): the base's soft E-stop on (`POST /agv/estop {on: true}`, base
  `/api/estop?flag=true`). The base halts where it is and keeps the drive (lumi-wave `docs/private/AGV_ON_OUR_ROBOT.md`, from the
  base's page: "soft E-stop only pauses it, `/api/move/cancel` ends it"). Still to check on the robot: that
  `move_status` stays `running` meanwhile (else lumi-wave's route runner ends the route).
  Its motors are free meanwhile, so Lumi can be pushed by hand.
- **RESUME** (filled red, slowly blinking): soft E-stop off (`{on: false}`): the same drive goes on from there, and so the
  route (lumi-wave's route runner waits on `move_status`) or the task that drives it.
- The red button on Lumi pressed: E-STOP turns dark red and a tap only buzzes (only a hand on Lumi releases it).
- No words pop up when E-STOP is pressed; the button's look says it.
- **STOP** stays as it was: it cancels the drive, the route, the arm, the task and the assistant. It does not release
  E-STOP; a held base keeps E-STOP lit until RESUME.

What was pressed shows at once and until `/status` says the same (4 s at most).

## Position correction (POSITION)

Like the base's own page (Thor `docs/05_AGV_BASE.md` §2.4):

1. **POSITION** opens it at once: a purple Lumi (the new pose) starts where the base believes Lumi is. The lidar (`/map/scan`, once a
   second) is drawn twice: **red** at the pose the base believes, **purple** at the new pose.
2. Move it until the purple dots sit on the walls: the arrows (right) move it 5 cm, ⟲ ⟳ turn it 2°, and keep going
   while held; a tap on the map puts it there, a drag also sets where Lumi faces.
3. **SAVE**, confirm (or CANCEL). Within about 20 cm and 5° is enough; the base refines the rest. Only while the base is
   free (idle or stopped).

## A new map (MAPPING)

Like the base's own map builder (Thor `docs/05_AGV_BASE.md` §2.2 and §7):

1. **MAPPING** asks a name: letters, digits and `_`, at most 36, not a name in MAPS (`map_1` is offered). Confirm:
   the base leaves the current map until another one is switched to in MAPS.
2. The base scans (a small map, 2 cm a pixel). The frame shows the new map as it grows (`/map/scan/picture`, every
   1.5 s) with Lumi on it (`/map/scan/state`, every second, pose from the base's `/robot_pose`); the joystick is on.
   Drive slowly, about 0.5 m from the walls, and turn around in each corner. Markers, lines, the route and the other
   nav items are off meanwhile (they need the base's map); taps on the map do nothing.
3. The bar shows the name, **Optimized 63%** when the base says (green at 100%), STOP and SAVE.
   - **SAVE** asks first ("Optimizing is not done yet. Save anyway?" below 100%), then waits for the base (up to 3
     min). The new map is then in MAPS; switch to it there and set the position.
   - **STOP** asks ("Stop scanning? The map is saved and goes to Maps."), then saves like SAVE. The base has no
     cancel (stopping a scan saves it) and its `delete_map` is not supported, so the app offers no delete.
4. A scan that is already running when the screen opens (the app was closed, or the base's page started it) is shown
   the same way; one that ends on the robot closes the view ("Mapping ended on the robot").

While a scan runs, lumi-wave refuses `/map/switch` and `/map/position` (409). Starting is refused while the assistant
or a task runs.

## Code

- `src/lib/mapGeom.ts`: map info, map ↔ picture coordinates, fit, zoom and pan, drag heading, true size, lidar
  points on the map (tests in `src/lib/__tests__/mapGeom.test.ts`).
- `src/lib/baseInfo.ts`: the base's state from `/status` (`toBaseState`, `baseText`), E-STOP (`estopLook`,
  `estopShown`), sensors and planned path replies, the trail (tests in `src/lib/__tests__/baseInfo.test.ts`).
- `src/ui/MapPanels.tsx`: the VIEW and BASE lists and the layers VIEW draws; `src/ui/EstopButton.tsx`: E-STOP.
- `src/lib/api.ts`: `getSensors`, `getPlan`, `setEstop` (a 404 is `NeedsUpdateError`), `getMapInfo`, `mapImageUrl`, `goMarker`, `goPoint`, `saveMarker`, `deleteMarker`, `setPosition`,
  `setPositionAtMarker`, `getScan`, `switchMap`, `getScanState`, `getScanPicture`, `startScan`, `saveScan`.
- `src/lib/mapping.ts`: the new map's state and picture, the name rule, progress (tests in
  `src/lib/__tests__/mapping.test.ts`).
- `src/ui/NameDialog.tsx`: the name dialog (markers, lines, a new map).

## Needs lumi-wave (Thor)

`GET /agv/sensors`, `GET /agv/plan`, `POST /agv/estop`, and `soft_estop_state` and `hard_estop_state` in `/status`
base: not in lumi-wave yet (2026-11-18); the app is built against them and says "Needs an update on the robot" until
then.

## In a browser

`npx expo start --web` runs the app in a browser for review (the 3D scene in an iframe). The robot API has no CORS,
so the browser needs a local proxy on 127.0.0.1:8100 and the connection's USB route: `npm run webproxy` (adds the
CORS headers), then open http://localhost:8081.
