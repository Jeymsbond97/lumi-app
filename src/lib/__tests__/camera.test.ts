import { CAMERA_ASPECT, cameraLayout, cameraLive, latestUrl } from '../camera';

const tablet = { width: 1280, height: 800, insetTop: 0, insetRight: 0, insetBottom: 0 };
const phone = { width: 844, height: 390, insetTop: 0, insetRight: 47, insetBottom: 21 };

// the components' own numbers: battery 14 + 36 from the top, joystick 18 + slider 44 + 10 + pad from the bottom
const batteryBottom = (s: typeof tablet) => s.insetTop + 50;
const joystickTop = (s: typeof tablet) => s.height - (s.insetBottom + 18 + 44 + 10 + Math.min(200, Math.max(120, 0.27 * s.height)));

describe('cameraLayout', () => {
  it('keeps the panel against the edge between the battery and the joystick on a tablet', () => {
    const l = cameraLayout(tablet);
    const bottom = l.top + 2 * l.pictureHeight + 3 * l.pad;
    expect(l.right).toBe(0);
    expect(l.top).toBeGreaterThan(batteryBottom(tablet));
    expect(bottom).toBeLessThan(joystickTop(tablet));
    expect(l.pictureWidth + 2 * l.pad + tablet.insetRight).toBeLessThanOrEqual(0.27 * tablet.width + 1);
  });

  it('moves the panel left of the joystick on a phone, with bigger pictures', () => {
    const l = cameraLayout(phone);
    const pad = 120; // the joystick on a 390 high screen
    const bottom = l.top + 2 * l.pictureHeight + 3 * l.pad;
    expect(l.right).toBeGreaterThanOrEqual(phone.insetRight + 24 + pad);
    expect(l.top).toBeGreaterThan(batteryBottom(phone));
    expect(bottom).toBeLessThan(phone.height - (phone.insetBottom + 18 + 64));
    expect(l.pictureHeight).toBeGreaterThanOrEqual(80);
  });

  it('keeps the pictures in the cameras shape', () => {
    const l = cameraLayout(tablet);
    expect(Math.abs(l.pictureWidth / l.pictureHeight - CAMERA_ASPECT)).toBeLessThan(0.02);
  });

  it('centres the button on the right edge', () => {
    const l = cameraLayout(tablet);
    expect(l.buttonTop + l.buttonHeight / 2).toBeCloseTo(400, 0);
  });

  it('gives no negative size on a tiny window', () => {
    const l = cameraLayout({ width: 300, height: 200, insetTop: 0, insetRight: 0, insetBottom: 0 });
    expect(l.pictureHeight).toBeGreaterThanOrEqual(0);
    expect(l.pictureWidth).toBeGreaterThanOrEqual(0);
    expect(cameraLayout({ width: 100, height: 100, insetTop: 0, insetRight: 0, insetBottom: 0 }).pictureHeight).toBe(0);
  });
});

describe('cameraLive', () => {
  it('is live with a fresh picture and no error', () => {
    expect(cameraLive({ age_s: 0.5, error: null })).toBe(true);
  });
  it('is not live when the robot reports an error', () => {
    expect(cameraLive({ age_s: 0.5, error: 'camera service not running' })).toBe(false);
  });
  it('is not live when the newest picture is old', () => {
    expect(cameraLive({ age_s: 30, error: null })).toBe(false);
  });
});

describe('latestUrl', () => {
  it('makes every address new', () => {
    expect(latestUrl('http://x:8100', 'head', 3)).toBe('http://x:8100/camera/head/latest.jpg?n=3');
  });
});
