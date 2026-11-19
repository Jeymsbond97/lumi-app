import { jointArc, padWedges, ringPath, tcpParts, toTcp } from '../armPad';

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe('ringPath', () => {
  it('draws the outer arc, then back along the inner one', () => {
    const p = ringPath(50, 50, 40, 20, 180, 270);
    expect(p.startsWith('M10.00 50.00 A40 40 0 0 1 50.00 10.00 L50.00 30.00 A20 20 0 0 0 30.00 50.00')).toBe(true);
    expect(p.endsWith('Z')).toBe(true);
  });
});

describe('jointArc', () => {
  it('has two halves a finger can hit, that barely overlap, inside its square', () => {
    const s = 86;
    const a = jointArc(s);
    for (const b of [a.minusBox, a.plusBox]) {
      expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(s * 0.5);
      expect(b.x + b.w).toBeLessThanOrEqual(s);
      expect(b.y + b.h).toBeLessThanOrEqual(s);
    }
    expect(overlap(a.minusBox, a.plusBox)).toBeLessThan(0.02 * s * s);
    // minus is the lower left half, plus the upper right
    expect(a.minusBox.y).toBeGreaterThan(a.plusBox.y);
    expect(a.plusBox.x).toBeGreaterThan(a.minusBox.x);
  });
});

describe('padWedges', () => {
  it('puts Y+ on top, X+ right, Y- at the bottom, X- left, with boxes that do not overlap', () => {
    const d = 160;
    const { wedges } = padWedges(d);
    const at = Object.fromEntries(wedges.map((w) => [w.key, w.label]));
    expect(at.up.y).toBeLessThan(d / 2);
    expect(at.down.y).toBeGreaterThan(d / 2);
    expect(at.left.x).toBeLessThan(d / 2);
    expect(at.right.x).toBeGreaterThan(d / 2);
    for (const a of wedges) for (const b of wedges) if (a !== b) expect(overlap(a.box, b.box)).toBe(0);
    for (const w of wedges) expect(Math.min(w.box.w, w.box.h)).toBeGreaterThanOrEqual(44);
  });
});

describe('the TCP read-out', () => {
  it('reads GET /arm/state and shows one decimal, mm then degrees', () => {
    const tcp = toTcp({ joints: [0, 0, 0, 0, 0, 0], tcp: [78.373, -13.198, 541.889, -29.425, 29.337, 136.999] });
    expect(tcp).not.toBeNull();
    expect(tcpParts(tcp!)).toEqual([
      { key: 'tcpX', value: '78.4 mm' },
      { key: 'tcpY', value: '-13.2 mm' },
      { key: 'tcpZ', value: '541.9 mm' },
      { key: 'tcpRx', value: '-29.4°' },
      { key: 'tcpRy', value: '29.3°' },
      { key: 'tcpRz', value: '137.0°' },
    ]);
  });

  it('shows no minus zero, and nothing for a reply without a whole TCP', () => {
    expect(tcpParts([-0.01, 0, 0, 0, 0, 0])[0].value).toBe('0.0 mm');
    expect(toTcp({ tcp: [1, 2, 3] })).toBeNull();
    expect(toTcp({ error: 'arm offline', tcp: [0, 0, 0, 0, 0, 0] })).toBeNull();
    expect(toTcp(null)).toBeNull();
  });
});
