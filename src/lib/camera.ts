// Lumi's two cameras on Home: where their pictures come from and where the panel showing them sits.
// The robot API keeps the newest picture of each camera at /camera/{name}/latest.jpg (the old web dashboard polls
// it too). A picture asked for again and again works on Android, iOS and in a browser alike; MJPEG in an Image does not
// on Android.
import { clamp } from '../ui/theme';

export const CAMERAS = ['head', 'torso'] as const;
export type CameraName = (typeof CAMERAS)[number];

/** Both cameras send 640 x 360. */
export const SMALL_PX = 640;

/**
 * The camera's own 1280 x 720 picture when the place it is shown in has more real pixels across than the 640 px
 * one (a phone or tablet screen has 2 to 3 pixels per point): scaled up, the small one looks smeared.
 */
export const wantsHd = (widthPt: number, pixelRatio: number) => widthPt * pixelRatio > SMALL_PX * 1.1;
export const CAMERA_ASPECT = 16 / 9;
/** At most one new picture per camera this often (5 a second). */
export const FRAME_MS = 200;
/** A picture that has not arrived by then is given up and asked for again. */
export const FRAME_TIMEOUT_MS = 4000;
/** After a failed picture, wait this long before asking again. */
export const RETRY_MS = 1000;
/** How often the camera's state (/info) is asked while the panel is open. */
export const INFO_MS = 2000;
/** A camera whose newest picture is older than this shows no picture: latest.jpg would keep giving the last one. */
export const STALE_S = 5;

/** The newest picture; `n` makes every address new so no cache answers in place of the robot. */
export const latestUrl = (baseUrl: string, name: CameraName, n: number) => `${baseUrl}/camera/${name}/latest.jpg?n=${n}`;
/** The newest picture at the camera's own size (1280 x 720) with the person boxes: for a picture that fills the screen
 *  (Drive), where the 640 px one looks blurred. An older robot API has none (404): latestUrl then. */
export const hdUrl = (baseUrl: string, name: CameraName, n: number) => `${baseUrl}/camera/${name}/hd.jpg?n=${n}`;
export const infoUrl = (baseUrl: string, name: CameraName) => `${baseUrl}/camera/${name}/info`;

export interface CameraInfo {
  age_s?: number | null;
  error?: string | null;
}

/** False when the robot says the camera has a problem or its newest picture is old. */
export function cameraLive(info: CameraInfo): boolean {
  if (info.error) return false;
  return info.age_s == null || info.age_s <= STALE_S;
}

export interface Screen {
  width: number;
  height: number;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
}

export interface CameraLayout {
  /** The panel's top edge and its picture size. */
  top: number;
  /** The panel's right side from the screen's right edge: 0 against the edge (tablets), or left of the joystick
   *  where a short screen (a phone on its side) leaves too little room above the joystick. */
  right: number;
  pictureWidth: number;
  pictureHeight: number;
  /** Space around and between the pictures; the right side also gets the safe area. */
  pad: number;
  /** The small camera button on the right edge, its middle at BUTTON_MIDDLE of the screen height (Home's WAVE
   *  sits level with it on the left edge). */
  buttonTop: number;
  buttonWidth: number;
  buttonHeight: number;
}

// Taken from the components' own style code:
// BatteryBadge: top 14 + inset.top, height 36.
const BATTERY_BOTTOM = 14 + 36;
// Joystick: bottom 18 + inset.bottom, right 24 + inset.right; a column of the pad (clamp(120, 0.27 h, 200)), a gap of
// 10 and the slider (44).
const joystickPad = (s: Screen) => clamp(120, 0.27 * s.height, 200);
const joystickTop = (s: Screen) => s.height - (s.insetBottom + 18 + 44 + 10 + joystickPad(s));
// Dock: bottom 18 + inset.bottom, about 64 tall with its note (DOCK_SPACE on Map).
const dockTop = (s: Screen) => s.height - (s.insetBottom + 18 + 64);

/** Room left between the panel and the battery above it, and the joystick below it. */
const GAP_TOP = 14;
const GAP_BOTTOM = 16;
/** The panel never gets wider than this part of the screen, so Lumi in the middle stays clear. */
const MAX_WIDTH_SHARE = 0.27;
const PAD = 8;
/** Pictures lower than this against the edge (a phone) move the panel left of the joystick, where it may be wider. */
const MIN_EDGE_PICTURE = 80;
const BESIDE_WIDTH_SHARE = 0.42;
const GAP_SIDE = 12;
/** The camera button's middle, as a share of the screen height: above the middle, clear of the modes (owner, 2026-11-23). */
const BUTTON_MIDDLE = 0.4;

/** The largest two pictures over each other that fit a band of this height and a panel of this width. */
function pictures(band: number, panelWidth: number) {
  const byHeight = Math.max(0, (band - 3 * PAD) / 2);
  const byWidth = (panelWidth - 2 * PAD) / CAMERA_ASPECT;
  const pictureHeight = Math.floor(Math.max(0, Math.min(byHeight, byWidth)));
  return { pictureHeight, pictureWidth: Math.floor(pictureHeight * CAMERA_ASPECT) };
}

export function cameraLayout(s: Screen): CameraLayout {
  const bandTop = s.insetTop + BATTERY_BOTTOM + GAP_TOP;

  // against the right edge, between the battery and the joystick
  let band = Math.max(0, joystickTop(s) - GAP_BOTTOM - bandTop);
  let right = 0;
  let { pictureHeight, pictureWidth } = pictures(band, MAX_WIDTH_SHARE * s.width - s.insetRight);

  // a phone on its side: left of the joystick, down to the dock, if that gives bigger pictures
  if (pictureHeight < MIN_EDGE_PICTURE) {
    const besideRight = s.insetRight + 24 + joystickPad(s) + GAP_SIDE;
    const besideBand = Math.max(0, dockTop(s) - GAP_BOTTOM - bandTop);
    const beside = pictures(besideBand, Math.min(BESIDE_WIDTH_SHARE * s.width, s.width - besideRight));
    if (beside.pictureHeight > pictureHeight) {
      ({ pictureHeight, pictureWidth } = beside);
      band = besideBand;
      right = besideRight;
    }
  }

  // a panel narrower than the band is tall is centred in it, like the button
  const panelHeight = 2 * pictureHeight + 3 * PAD;
  const top = Math.round(bandTop + Math.max(0, band - panelHeight) / 2);

  const buttonHeight = clamp(44, 0.07 * s.height, 56);
  const buttonWidth = Math.round(buttonHeight * 0.85);
  return {
    top,
    right,
    pictureWidth,
    pictureHeight,
    pad: PAD,
    buttonTop: Math.round(BUTTON_MIDDLE * s.height - buttonHeight / 2),
    buttonWidth,
    buttonHeight,
  };
}
