import { bodyCard, driveLayout, genieStart, MIN_TOUCH } from '../driveLayout';

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

  it('a phone on its side has it top centre, clear of the open body card', () => {
    const l = driveLayout(phone);
    expect(l.pip.place).toBe('top');
    expect(Math.abs(l.pip.left + l.pip.width / 2 - phone.width / 2)).toBeLessThanOrEqual(1);
    // the picture has a 3 px padding and a 1 px border
    expect(l.pip.top + l.pip.height + 8).toBeLessThan(phone.height - l.body.bottom - l.body.height);
  });

  it('the body card fits between the modes and the joystick, every button touched over 44 px or more', () => {
    for (const s of [phone, tablet]) {
      const l = driveLayout(s);
      expect(l.body.width).toBeLessThanOrEqual(l.panel.maxWidth);
      expect(l.body.button + 2 * l.body.slop).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(l.toggle.size).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
    // smaller than the first card (44 px buttons): 40 at most, the rest of 44 px is touch room
    expect(driveLayout(tablet).body.button).toBeLessThanOrEqual(40);
    expect(driveLayout(phone).body.width).toBeLessThan(370);
  });

  it('the body card sits on the dock line, where its settings button is', () => {
    const l = driveLayout(phone);
    expect(l.body.bottom).toBe(l.toggle.bottom);
    expect(l.toggle.bottom).toBe(phone.insetBottom + 18 + 64);
  });

  it('a short card keeps its buttons at 34 px, with the rest of 44 px as touch slop', () => {
    const c = bodyCard(340, 60, 10, 0);
    expect(c.button).toBe(34);
    expect(c.button + 2 * c.slop).toBeGreaterThanOrEqual(MIN_TOUCH);
    expect(c.width).toBeLessThanOrEqual(340);
  });

  it('the card grows out of the settings button: at the start it is the button, on its centre', () => {
    for (const sc of [phone, tablet]) {
      const l = driveLayout(sc);
      const g = genieStart(l.body, l.toggle);
      // the card's centre moved down by dy lands on the button's centre (screen y grows downwards)
      const cardCentreY = sc.height - l.body.bottom - l.body.height / 2;
      expect(cardCentreY + g.dy).toBeCloseTo(sc.height - l.toggle.bottom - l.toggle.size / 2);
      expect(l.body.width * g.sx).toBeCloseTo(l.toggle.size);
      expect(l.body.height * g.sy).toBeCloseTo(l.toggle.size);
    }
  });
});
