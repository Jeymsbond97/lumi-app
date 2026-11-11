# Lumi App: plan

A mobile app (iPhone and tablets) that replaces the robot's web dashboard. It talks to the robot API that already
runs on the Jetson Thor (`lumi-wave`, FastAPI on port 8100). The robot does the work; the app makes it easy to ask.

Stack: Expo (React Native) + TypeScript, Expo Router, TanStack Query, Zustand, React Native Skia,
react-native-gesture-handler. Clean architecture: `domain` (entities, use cases, repository interfaces),
`data` (API client, DTO mapping), `features` (screens and view models), `ui` (design system).

Each phase ends with something that runs on a real device and is checked on the robot before the next one starts.

## Phase 1: Foundation

- Expo + TypeScript project, folder structure, lint, format, unit tests.
- Design system: colours, type, spacing, icons, base components.
- Connection: finds the robot by itself on the robot Wi-Fi (192.168.10.240), the office Wi-Fi (192.168.0.250) or
  Tailscale (`lumi-thor`); shows which one is used. iOS local network and plain-HTTP settings.
- API client with timeouts and clear errors (robot off, busy, switches off).

Done when: the app opens on an iPhone and an Android tablet through Expo Go and shows "Connected" with the battery.

## Phase 2: Home and safety

- Status bar on every screen: battery, charging, mode, what the robot is doing now, connection quality.
- STOP on every screen, one tap, no confirmation.
- Modes: Greeter, Patrol, Wave greeting.
- Current task card: steps, Pause / Resume, Stop, Release while handing over.

## Phase 3: One-tap commands

- Every robot command is one button: Take the cup, Put it down, Hand it over, Bring me a bottle, Wave, Sing,
  Follow me, Come here, Look at me, Go home, Go to <place>, and the rest.
- A button sends the same words voice would (`/tasks/parse`), the robot reads them exactly as by voice, and the app
  starts what it read (`/tasks/fetch`, `/tasks/steps`, `/tasks/command`, `/tasks/place`, `/tasks/give`). The robot
  itself finds the object, drives closer or backs off, reaches and grasps.
- Buttons follow the robot's state: Put it down and Hand it over show while it holds something; places come from
  the current map.
- Each button's words are checked against `/tasks/parse` (nothing moves) before it ships, then run live with the
  owner at the STOP.

## Phase 4: Drive

- Both cameras live, people and object boxes drawn on top.
- Hold-to-move joystick for the base (stops by itself when released or when the connection drops), head by
  dragging on the video, lift and waist.
- Latency shown on screen.

## Phase 5: Map

- Map with the robot's position and heading, places as pins.
- Tap a place to go there, long-press the map to go to a point, Dock.
- Save the current spot as a place, delete a place, correct the robot's position, switch maps.

## Phase 6: Conversation

- What Lumi hears and answers, as a chat.
- Say and Ask, speaker volume.

## Phase 7: Expert mode

Behind a PIN: arm power, enable, poses and joints, gripper, Cobo π programs, voice-direction calibration, logs,
the arm controller's page (Cobo π) inside the app.

## Phase 8: Mapping

- First version: start and save through the base's own map builder inside the app; driving with the app's joystick;
  the map growing live (rosbridge on the base, `/map`, `/scan`, `/robot_pose`).
- Second version: start and save from the app's own buttons, once the builder's calls are recorded on the robot.

## Phase 9: Robot API additions

Changes in `lumi-wave`, each one agreed with the owner first:
- Sign-in token for the API.
- Event stream (WebSocket) instead of polling.
- Conversation history endpoint.
- Proxy for the base's ports (9001, 8809, 9090) so mapping also works over Tailscale.

## Phase 10: Release

App icon, splash screen, Android APK for the tablets, TestFlight for iPhones (needs an Apple Developer account).
