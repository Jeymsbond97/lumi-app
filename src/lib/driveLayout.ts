// Where the Drive screen's parts go, around the controls every screen has (taken from their own style code):
// LUMI and its state top left, the body and arm chips top centre, the battery top right with head, waist and lift
// under it, the modes on the left above STOP (bottom left), the sections dock bottom centre, the joystick bottom right.
// The big camera fills the screen behind all of them. The small camera sits on the right between the readings and
// the joystick; on a short screen (a phone on its side) that leaves too little room, so it goes top centre under the
// chips instead. The body and arm buttons sit bottom centre over the dock, between the modes and the joystick.
import { CAMERA_ASPECT, type Screen } from './camera';
import { clamp } from '../ui/theme';

export interface DriveLayout {
  /** The small camera picture. */
  pip: { top: number; left: number; width: number; height: number; place: 'side' | 'top' };
  /** The buttons panel: its bottom edge from the screen's bottom, centred, at most this wide. */
  panel: { bottom: number; maxWidth: number; centreX: number };
  /** A hold button's side. */
  button: number;
}

const GAP = 12;
const MIN_SIDE_PICTURE = 80;
const PIP_WIDTH_SHARE = 0.24;
const PIP_TOP_WIDTH_SHARE = 0.2;
const PIP_MAX_W = 340;

// StatusHud: name top 14 + inset; chips 2.6 x the small text; readings 52 under the top, three rows of the small text.
const small = (h: number) => clamp(11, 0.019 * h, 15);
const chipsBottom = (s: Screen) => s.insetTop + 14 + 2.6 * small(s.height);
const readingsBottom = (s: Screen) => s.insetTop + 14 + 52 + 3 * 1.4 * small(s.height) + 2 * 6;
// Joystick: bottom 18 + inset, right 24 + inset; the pad clamp(120, 0.27 h, 200) over a gap of 10 and the slider (44).
const joystickPad = (h: number) => clamp(120, 0.27 * h, 200);
const joystickTop = (s: Screen) => s.height - (s.insetBottom + 18 + 44 + 10 + joystickPad(s.height));
const joystickLeft = (s: Screen) => s.width - (s.insetRight + 24 + joystickPad(s.height) + 20); // the slider is 20 wider
// ModesPanel: left 26 + inset, 16 to the names, the names clamp(13, 0.024 h, 18) x 6.4, a gap, the switch.
const modesRight = (s: Screen) => {
  const text = clamp(13, 0.024 * s.height, 18);
  return 26 + 16 + text * 6.4 + text * 0.8 + clamp(36, 0.06 * s.height, 46);
};
/** Room the sections dock takes at the bottom, above the safe area (as on Map). */
export const DOCK_SPACE = 64;

/** The small camera picture on the right side or top centre, and the buttons panel bottom centre. */
export function driveLayout(s: Screen & { insetLeft?: number }): DriveLayout {
  const insetLeft = s.insetLeft ?? 0;
  const sideTop = readingsBottom(s) + GAP;
  const sideBand = Math.max(0, joystickTop(s) - GAP - sideTop);
  const sideWidth = Math.min(PIP_MAX_W, PIP_WIDTH_SHARE * s.width, sideBand * CAMERA_ASPECT);
  let pip: DriveLayout['pip'];
  if (sideWidth / CAMERA_ASPECT >= MIN_SIDE_PICTURE) {
    const width = Math.floor(sideWidth);
    pip = { top: Math.round(sideTop), left: Math.round(s.width - s.insetRight - 24 - width), width, height: Math.floor(width / CAMERA_ASPECT), place: 'side' };
  } else {
    const width = Math.floor(Math.min(PIP_MAX_W, PIP_TOP_WIDTH_SHARE * s.width));
    pip = { top: Math.round(chipsBottom(s) + GAP), left: Math.round((s.width - width) / 2), width, height: Math.floor(width / CAMERA_ASPECT), place: 'top' };
  }

  const centreX = s.width / 2;
  const half = Math.min(centreX - (insetLeft + modesRight(s) + GAP), joystickLeft(s) - GAP - centreX);
  return {
    pip,
    panel: { bottom: s.insetBottom + 18 + DOCK_SPACE, maxWidth: Math.max(0, Math.floor(2 * half)), centreX },
    button: Math.round(clamp(38, 0.1 * s.height, 54)),
  };
}
