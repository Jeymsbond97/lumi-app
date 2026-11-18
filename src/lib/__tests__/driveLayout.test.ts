import { driveLayout } from '../driveLayout';

const phone = { width: 844, height: 390, insetTop: 0, insetRight: 47, insetBottom: 21, insetLeft: 47 };
const tablet = { width: 1280, height: 800, insetTop: 0, insetRight: 0, insetBottom: 0 };

describe('driveLayout', () => {
  it('a tablet has the small camera on the right, above the joystick', () => {
    const l = driveLayout(tablet);
    expect(l.pip.place).toBe('side');
    expect(l.pip.left + l.pip.width).toBeLessThanOrEqual(tablet.width - 24);
    const joystickTop = tablet.height - (18 + 44 + 10 + 200);
    expect(l.pip.top + l.pip.height).toBeLessThan(joystickTop);
    expect(l.pip.height).toBeGreaterThanOrEqual(80);
  });

  it('a phone on its side has it top centre, clear of the buttons panel', () => {
    const l = driveLayout(phone);
    expect(l.pip.place).toBe('top');
    expect(Math.abs(l.pip.left + l.pip.width / 2 - phone.width / 2)).toBeLessThanOrEqual(1);
    // the arm page is the taller one: a header, the joints and a row of buttons
    const armPanel = 16 + 28 + 8 + l.button + 8 + 36;
    expect(l.pip.top + l.pip.height).toBeLessThan(phone.height - l.panel.bottom - armPanel);
  });

  it('the panel fits between the modes and the joystick', () => {
    for (const s of [phone, tablet]) {
      const l = driveLayout(s);
      // the Body page: four groups of two buttons (drive.tsx gaps: 0.45 and 0.8 of the text, padding 0.7 of it)
      const text = Math.min(14, Math.max(10, 0.018 * s.height));
      const fourBodyGroups = 4 * (2 * l.button + 0.45 * text) + 3 * 0.8 * text + 2 * 0.7 * text;
      expect(l.panel.maxWidth).toBeGreaterThanOrEqual(fourBodyGroups);
      expect(l.panel.maxWidth).toBeLessThan(s.width / 1.4);
    }
  });

  it('buttons are big enough for a finger on a phone and not huge on a tablet', () => {
    expect(driveLayout(phone).button).toBeGreaterThanOrEqual(38);
    expect(driveLayout(tablet).button).toBeLessThanOrEqual(54);
  });
});
