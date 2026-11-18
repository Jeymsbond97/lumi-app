# The Map screen

The Dock's **MAP** opens `src/app/(robot)/map.tsx`. It shows the robot's current map and Lumi on it, and does what the
base's own web page does, through lumi-wave's `/map/*` endpoints (Thor `docs/05_AGV_BASE.md` §6). Home stays mounted
while Map is open (Tabs in `src/app/(robot)/_layout.tsx`), so going back does not reload the 3D scene.

## Layout

- **Navbar** at the top: CONTROL, MARKERS ▾, LINES ▾, POSITION, MAPPING, MAPS ▾, SETTINGS. SETTINGS says
  "Coming soon" for now.
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
| No-go lines | always drawn in red. LINES ▾ → + New line: each tap on the map is a point (UNDO, CLEAR, CANCEL), SAVE (2 points or more) asks a name; a line's name lights it up; ✎ renames (saved anew, old deleted) or deletes | `/map/info` `lines`, `/map/line`, `/map/line/delete` (base `/forbidden_manager/action_service` list_lines, add_lines, delete_lines over rosbridge) |

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
- `src/lib/api.ts`: `getMapInfo`, `mapImageUrl`, `goMarker`, `goPoint`, `saveMarker`, `deleteMarker`, `setPosition`,
  `setPositionAtMarker`, `getScan`, `switchMap`, `getScanState`, `getScanPicture`, `startScan`, `saveScan`.
- `src/lib/mapping.ts`: the new map's state and picture, the name rule, progress (tests in
  `src/lib/__tests__/mapping.test.ts`).
- `src/ui/NameDialog.tsx`: the name dialog (markers, lines, a new map).

## In a browser

`npx expo start --web` runs the app in a browser for review (the 3D scene in an iframe). The robot API has no CORS,
so the browser needs a local proxy on 127.0.0.1:8100 and the connection's USB route: `npm run webproxy` (adds the
CORS headers), then open http://localhost:8081.
