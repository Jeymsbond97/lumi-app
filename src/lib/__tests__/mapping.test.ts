import { worldToPixel } from '../mapGeom';
import { keepPicture, progressText, saveEarly, toScanPicture, toScanState, validNewMapName } from '../mapping';

// the shapes lumi-wave /map/scan/state and /map/scan/picture give (api/server.py, tests/test_map_scan.py)
describe('the new map being made', () => {
  it('reads the state: name, floor, pose, progress kept within 0..1', () => {
    expect(toScanState({ mapping: true, name: 'hall_2', floor: 1, pose: { x: 1, y: 2, theta: 1.57 }, progress: 1.4 })).toEqual({
      mapping: true,
      name: 'hall_2',
      floor: 1,
      pose: { x: 1, y: 2, theta: 1.57 },
      progress: 1,
    });
    expect(toScanState({ mapping: false, name: '', floor: 1, pose: null, progress: null })).toEqual({
      mapping: false,
      name: '',
      floor: 1,
      pose: null,
      progress: null,
    });
    // a pose without a place is no pose; no heading is 0
    expect(toScanState({ mapping: true, pose: { x: 1 } }).pose).toBeNull();
    expect(toScanState({ mapping: true, pose: { x: 1, y: 2 } }).pose).toEqual({ x: 1, y: 2, theta: 0 });
  });

  it('reads the picture as a map the screen can draw, with nothing on it yet', () => {
    const p = toScanPicture({ width: 6, height: 4, resolution: 0.05, origin_x: -1, origin_y: -2, exact: true, png: 'AAA' }, 'hall_2', 1);
    expect(p?.uri).toBe('data:image/png;base64,AAA');
    expect(p?.exact).toBe(true);
    expect(p?.info).toMatchObject({ name: 'hall_2', floor: 1, width: 6, height: 4, markers: [], lines: [] });
    // the map frame's origin is the picture's bottom left corner
    expect(worldToPixel(p!.info, -1, -2)).toEqual({ x: 0, y: 4 });
    expect(toScanPicture({ width: 6, height: 4 }, 'x', 1)).toBeNull();
    expect(toScanPicture({ width: 0, height: 4, png: 'A' }, 'x', 1)).toBeNull();
  });

  it('keeps the last good picture while a new one has no geometry yet', () => {
    const good = toScanPicture({ width: 6, height: 4, png: 'A', exact: true }, 'm', 1);
    const off = toScanPicture({ width: 7, height: 5, png: 'B', exact: false }, 'm', 1);
    const next = toScanPicture({ width: 7, height: 5, png: 'C', exact: true }, 'm', 1);
    expect(keepPicture(null, off)).toBe(off); // better than nothing
    expect(keepPicture(good, off)).toBe(good);
    expect(keepPicture(good, next)).toBe(next);
    expect(keepPicture(good, null)).toBe(good);
  });

  it('takes a new name the base allows and not one in MAPS', () => {
    const maps = ['office', 'lab'];
    expect(validNewMapName('hall_2', maps)).toBe(true);
    expect(validNewMapName('a'.repeat(36), maps)).toBe(true);
    for (const bad of ['', 'a b', 'a-b', '로비', 'a'.repeat(37), 'lab']) expect(validNewMapName(bad, maps)).toBe(false);
  });

  it('shows the progress and asks before saving early', () => {
    expect(progressText(0.634)).toBe('63%');
    expect(progressText(1)).toBe('100%');
    expect(saveEarly(0.5)).toBe(true);
    expect(saveEarly(1)).toBe(false);
    expect(saveEarly(null)).toBe(false);
  });
});
