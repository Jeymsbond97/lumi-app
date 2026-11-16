import {
  clampOffset,
  clampZoom,
  fitMap,
  footprintPx,
  headingFromDrag,
  LUMI_BASE_M,
  MIN_FOOTPRINT_PX,
  KEEP_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  nextMarkerName,
  pixelToWorld,
  scanToWorld,
  toMapInfo,
  validMarkerName,
  worldToPixel,
  zoomAbout,
} from '../mapGeom';

// the shape lumi-wave /map/info gives (api/server.py map_info), from the robot on 2026-11-16
const RAW = {
  map_name: 'cutshion_708_B_block',
  floor: 1,
  width: 1337,
  height: 1669,
  resolution: 0.02,
  origin_x: -13.4889,
  origin_y: -17.3826,
  markers: [
    { name: 'Home', type: 11, x: -1.22, y: 0.05, theta: -0.04 },
    { name: 'p1', type: 0, x: 4.8, y: -0.49, theta: 1.0 },
    { name: 'p2', type: 0, x: 0, y: 0, theta: 0 },
  ],
  main_dock: 'Home',
  maps: [{ name: 'KINTEX', floors: [1] }, { name: 'cutshion_708_B_block', floors: [1] }],
};

describe('toMapInfo', () => {
  it('reads the map, its markers (the dock marked) and the other maps', () => {
    const m = toMapInfo(RAW);
    expect(m.name).toBe('cutshion_708_B_block');
    expect(m.markers.map((k) => [k.name, k.dock])).toEqual([['Home', true], ['p1', false], ['p2', false]]);
    expect(m.maps).toEqual([{ name: 'KINTEX', floor: 1 }, { name: 'cutshion_708_B_block', floor: 1 }]);
  });
});

describe('map coordinates', () => {
  const m = toMapInfo(RAW);
  it('puts a point of the map frame on the picture (y up on the map, down in the picture)', () => {
    const p = worldToPixel(m, m.originX, m.originY);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(m.height);
    const q = worldToPixel(m, -1.22, 0.05);
    expect(q.x).toBeCloseTo((-1.22 + 13.4889) / 0.02);
    expect(q.y).toBeCloseTo(1669 - (0.05 + 17.3826) / 0.02);
  });

  it('goes back from the picture to the map frame', () => {
    const w = pixelToWorld(m, worldToPixel(m, 2.5, -3.75).x, worldToPixel(m, 2.5, -3.75).y);
    expect(w.x).toBeCloseTo(2.5);
    expect(w.y).toBeCloseTo(-3.75);
  });

  it('fits the whole picture into the view, centred', () => {
    const f = fitMap(1000, 2000, 500, 500);
    expect(f.scale).toBeCloseTo(0.25);
    expect(f.left).toBeCloseTo(125);
    expect(f.top).toBeCloseTo(0);
    expect(fitMap(1000, 2000, 0, 500).scale).toBe(0);
  });
});

describe('marker names', () => {
  it('takes letters, digits, _ and - only, at most 50 (what the base accepts)', () => {
    expect(validMarkerName('door_1')).toBe(true);
    expect(validMarkerName('a-b')).toBe(true);
    for (const bad of ['', 'a b', 'x/y', '로비', 'a'.repeat(51)]) expect(validMarkerName(bad)).toBe(false);
  });

  it('suggests the next free pN', () => {
    expect(nextMarkerName(['Home', 'p1', 'p2', 'p10'])).toBe('p3');
    expect(nextMarkerName([])).toBe('p1');
  });
});

describe('zooming the map view', () => {
  it('zooms about a point: the map point under it stays where it is', () => {
    const off = { x: 100, y: 50 };
    const next = zoomAbout(off, 1, 2, 300, 250);
    // the map pixel under (300, 250) at zoom 1 is (300 - 100, 250 - 50) / s; at zoom 2 it is still under (300, 250)
    expect(300 - next.x).toBeCloseTo((300 - off.x) * 2);
    expect(250 - next.y).toBeCloseTo((250 - off.y) * 2);
  });

  it('keeps the zoom between the whole map and 8 times', () => {
    expect(clampZoom(0.3)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('keeps some of the map in the view when it is pushed away', () => {
    // a 400 x 300 picture at scale 1 in a 500 x 400 view: at least KEEP_PX of it stays inside
    const c = clampOffset({ x: 2000, y: -2000 }, 400, 300, 500, 400);
    expect(c.x).toBe(500 - KEEP_PX);
    expect(c.y).toBe(-300 + KEEP_PX);
  });
});

describe('heading from a drag on the map', () => {
  it('turns a screen drag (y down) into a map heading (rad, + counter-clockwise from +x)', () => {
    expect(headingFromDrag(10, 0)).toBeCloseTo(0);              // right: east
    expect(headingFromDrag(0, -10)).toBeCloseTo(Math.PI / 2);   // up the screen: north
    expect(headingFromDrag(-10, 0)).toBeCloseTo(Math.PI);
    expect(headingFromDrag(0, 10)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('Lumi at true size on the map', () => {
  it('draws the 510 mm base at the map scale, never smaller than MIN_FOOTPRINT_PX', () => {
    expect(LUMI_BASE_M).toBe(0.51);
    expect(footprintPx(0.02, 1)).toBeCloseTo(25.5);        // 0.51 m / 0.02 m per pixel
    expect(footprintPx(0.02, 2)).toBeCloseTo(51);
    expect(footprintPx(0.02, 0.1)).toBe(MIN_FOOTPRINT_PX);  // far out: still seen
  });
});

describe('the lidar scan on the map', () => {
  it('puts points around the base (x ahead, y left) at a pose of the map frame', () => {
    const at = { x: 2, y: 1, theta: Math.PI / 2 };          // facing +y
    const [ahead, left] = scanToWorld([[1, 0], [0, 1]], at);
    expect(ahead.x).toBeCloseTo(2);
    expect(ahead.y).toBeCloseTo(2);                         // 1 m ahead is +y
    expect(left.x).toBeCloseTo(1);                          // 1 m to the left is -x
    expect(left.y).toBeCloseTo(1);
  });
});
