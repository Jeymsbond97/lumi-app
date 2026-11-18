# Lumi App

Mobile app for the JAKA Lumi service robot: status, one-tap commands, driving, map and conversation, on iPhone and
tablets. It works with the robot API on the robot's Jetson Thor.

## Demo

![Lumi App demo](docs/media/lumi-app-demo.gif)

The preview above plays at 3x speed. Full video at normal speed:
[docs/media/lumi-app-demo.mp4](docs/media/lumi-app-demo.mp4) (about 2 minutes).

## Screens

Screenshots were taken on a tablet. The app also fits phones.

### Home

The 3D robot shows the live state of the body and arm. The left side holds the behaviour modes (Greeter, Patrol,
Wave, Welcome), the right side holds the joystick and the camera button, and the red STOP button is always in the
bottom left corner.

| Home | Head and torso cameras |
|---|---|
| ![Home](docs/media/home.png) | ![Home with cameras](docs/media/home-cameras.png) |
| **Drive on, modes running** | **Korean** |
| ![Home with drive on](docs/media/home-drive.png) | ![Home in Korean](docs/media/home-korean.png) |

### Map

The map is the robot's own sensor map, drawn the same way as the base web page. The top bar has Control, Markers,
Lines, Position, Mapping, Maps and Settings.

| Map | Map with cameras |
|---|---|
| ![Map](docs/media/map.png) | ![Map with cameras](docs/media/map-cameras.png) |
| **Driving from the map** | **Saved maps** |
| ![Map with joystick](docs/media/map-drive.png) | ![Saved maps list](docs/media/map-list.png) |
| **Route panel** | **Route with stops** |
| ![Route panel](docs/media/map-route.png) | ![Route with stops on the map](docs/media/map-route-stops.png) |

### Setting the robot position

Move the purple laser dots onto the walls, then save.

![Setting the robot position](docs/media/map-position.png)

### Earlier versions

| Home | Map |
|---|---|
| ![Early home](docs/media/early-home.png) | ![Early map](docs/media/early-map.png) |
