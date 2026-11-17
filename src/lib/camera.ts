// Lumi's two cameras on Home: where their pictures come from and where the panel showing them sits.
// The robot API keeps the newest picture of each camera at /camera/{name}/latest.jpg (the old web dashboard polls
// it too). A picture asked for again and again works on Android, iOS and in a browser alike; MJPEG in an Image does not
// on Android.
import { clamp } from '../ui/theme';

export const CAMERAS = ['head', 'torso'] as const;
export type CameraName = (typeof CAMERAS)[number];

/** Both cameras send 640 x 360. */
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
  /** The panel's top edge and its picture size; its right side is the screen's right edge. */
  top: number;
  pictureWidth: number;
  pictureHeight: number;
  /** Space around and between the pictures; the right side also gets the safe area. */
  pad: number;
  /** The small camera button on the right edge, centred vertically. */
  buttonTop: number;
  buttonWidth: number;
  buttonHeight: number;
}

// Taken from the components' own style code:
// BatteryBadge: top 14 + inset.top, height 36.
const BATTERY_BOTTOM = 14 + 36;
// Joystick: bottom 18 + inset.bottom; a column of the pad (clamp(120, 0.27 h, 200)), a gap of 10 and the slider (44).
const joystickTop = (s: Screen) => s.height - (s.insetBottom + 18 + 44 + 10 + clamp(120, 0.27 * s.height, 200));

/** Room left between the panel and the battery above it, and the joystick below it. */
const GAP_TOP = 14;
const GAP_BOTTOM = 16;
/** The panel never gets wider than this part of the screen, so Lumi in the middle stays clear. */
const MAX_WIDTH_SHARE = 0.27;
const PAD = 8;

export function cameraLayout(s: Screen): CameraLayout {
  const bandTop = s.insetTop + BATTERY_BOTTOM + GAP_TOP;
  const bandBottom = joystickTop(s) - GAP_BOTTOM;
  const band = Math.max(0, bandBottom - bandTop);

  // two pictures over each other, with the padding around and between them
  const byHeight = Math.max(0, (band - 3 * PAD) / 2);
  const byWidth = (MAX_WIDTH_SHARE * s.width - 2 * PAD - s.insetRight) / CAMERA_ASPECT;
  const pictureHeight = Math.floor(Math.max(0, Math.min(byHeight, byWidth)));
  const pictureWidth = Math.floor(pictureHeight * CAMERA_ASPECT);

  // a panel narrower than the band is tall is centred in it, like the button
  const panelHeight = 2 * pictureHeight + 3 * PAD;
  const top = Math.round(bandTop + Math.max(0, band - panelHeight) / 2);

  const buttonHeight = clamp(44, 0.07 * s.height, 56);
  const buttonWidth = Math.round(buttonHeight * 0.85);
  return {
    top,
    pictureWidth,
    pictureHeight,
    pad: PAD,
    buttonTop: Math.round(s.height / 2 - buttonHeight / 2),
    buttonWidth,
    buttonHeight,
  };
}
