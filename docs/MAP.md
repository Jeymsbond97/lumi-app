# The Map screen

The Dock's **MAP** opens `src/app/(robot)/map.tsx`. It shows the robot's current map and Lumi on it, and does what the
base's own web page does, through lumi-wave's `/map/*` endpoints (Thor `docs/05_AGV_BASE.md` §6). Home stays mounted
while Map is open (Tabs in `src/app/(robot)/_layout.tsx`), so going back does not reload the 3D scene.

## Layout

- **Navbar** at the top: CONTROL, MARKERS ▾, ROUTE, POSITION ▾, MAPPING, MAPS ▾, SETTINGS. ROUTE, MAPPING and
  SETTINGS say "Coming soon" for now.
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
| Save a marker | MARKERS ▾ → + Save a marker where Lumi is, or a tapped point → SAVE; name: letters, digits, `_`, `-` | `/map/marker` |
| Delete a marker | MARKERS ▾ → ✕ (not the charger's) | `/map/marker/delete` |
| Switch maps | MAPS ▾ → a map, confirm; reloads after 15 s; correct the position after | `/map/switch` |
| Drive by hand | CONTROL shows the joystick | `/jog` |
| See no-go lines | always drawn in red; they are drawn and edited in the base's web page (:9001) | `/map/info` `lines` (base `/forbidden_manager/action_service` list_lines over rosbridge) |

## Position correction (POSITION ▾)

Like the base's own page (Thor `docs/05_AGV_BASE.md` §2.4):

1. **Tap or drag on the map.** The new pose starts where the base believes Lumi is. The lidar (`/map/scan`, once a
   second) is drawn twice: **red** at the pose the base believes, **purple** at the new pose.
2. Move the new pose until the purple dots sit on the walls: the arrows move it 5 cm, ⟲ ⟳ turn it 2°; a tap puts it
   there, a drag also sets where Lumi faces.
3. **SET POSITION**, confirm. Within about 20 cm and 5° is enough; the base refines the rest. Only while the base is
   free (idle or stopped).

Or **Lumi is at** → a marker: the pose is taken from that marker (quickest after a map switch).

## Code

- `src/lib/mapGeom.ts`: map info, map ↔ picture coordinates, fit, zoom and pan, drag heading, true size, lidar
  points on the map (tests in `src/lib/__tests__/mapGeom.test.ts`).
- `src/lib/api.ts`: `getMapInfo`, `mapImageUrl`, `goMarker`, `goPoint`, `saveMarker`, `deleteMarker`, `setPosition`,
  `setPositionAtMarker`, `getScan`, `switchMap`.
- `src/ui/NameDialog.tsx`: the marker name dialog.

## In a browser

`npx expo start --web` runs the app in a browser for review (the 3D scene in an iframe). The robot API has no CORS,
so the browser needs a local proxy on 127.0.0.1:8100 and the connection's USB route.
