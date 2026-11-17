import { CAMERA_ASPECT, cameraLayout, cameraLive, latestUrl } from '../camera';

const tablet = { width: 1280, height: 800, insetTop: 0, insetRight: 0, insetBottom: 0 };
const phone = { width: 844, height: 390, insetTop: 0, insetRight: 47, insetBottom: 21 };

// the components' own numbers: battery 14 + 36 from the top, joystick 18 + slider 44 + 10 + pad from the bottom
const batteryBottom = (s: typeof tablet) => s.insetTop + 50;
const joystickTop = (s: typeof tablet) => s.height - (s.insetBottom + 18 + 44 + 10 + Math.min(200, Math.max(120, 0.27 * s.height)));

describe('cameraLayout', () => {
  for (const [what, s] of [
    ['tablet', tablet],
    ['phone', phone],
  ] as const) {
    it(`keeps the panel between the battery and the joystick on a ${what}`, () => {
      const l = cameraLayout(s);
      const bottom = l.top + 2 * l.pictureHeight + 3 * l.pad;
      expect(l.top).toBeGreaterThan(batteryBottom(s));
      expect(bottom).toBeLessThan(joystickTop(s));
      expect(l.pictureHeight).toBeGreaterThan(0);
    });

    it(`stays clear of the middle of the screen on a ${what}`, () => {
      const l = cameraLayout(s);
      expect(l.pictureWidth + 2 * l.pad + s.insetRight).toBeLessThanOrEqual(0.27 * s.width + 1);
    });
  }

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
    expect(l.pictureHeight).toBe(0);
    expect(l.pictureWidth).toBe(0);
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
