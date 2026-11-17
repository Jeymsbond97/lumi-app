// The robot's map for the Map screen: lumi-wave /map/info (api/server.py map_info), and the sums between the map
// frame (metres, y up, the base's lidar map) and its picture (/map/image: pixels, y down).

export interface MapMarker {
  name: string;
  x: number;
  y: number;
  theta: number;
  /** The charger's marker (the base docks with it; it can't be deleted). */
  dock: boolean;
}

export interface MapInfo {
  name: string;
  floor: number;
  /** Picture size in pixels. */
  width: number;
  height: number;
  /** Metres per pixel. */
  resolution: number;
  /** Map frame position of the picture's bottom left corner. */
  originX: number;
  originY: number;
  markers: MapMarker[];
  /** No-go lines drawn in the base's web page (the base never drives across them), map frame metres. */
  lines: { name: string; points: { x: number; y: number }[] }[];
  maps: { name: string; floor: number }[];
}

interface RawMapInfo {
  map_name?: string;
  floor?: number;
  width?: number;
  height?: number;
  resolution?: number;
  origin_x?: number;
  origin_y?: number;
  markers?: { name: string; type?: number; x: number; y: number; theta?: number }[];
  main_dock?: string | null;
  lines?: { name: string; points?: number[][] }[];
  maps?: { name: string; floors?: number[] }[];
}

export function toMapInfo(raw: RawMapInfo): MapInfo {
  const dock = raw.main_dock ?? null;
  return {
    name: raw.map_name ?? '',
    floor: raw.floor ?? 1,
    width: raw.width ?? 0,
    height: raw.height ?? 0,
    resolution: raw.resolution ?? 0.05,
    originX: raw.origin_x ?? 0,
    originY: raw.origin_y ?? 0,
    markers: (raw.markers ?? []).map((m) => ({
      name: m.name,
      x: m.x,
      y: m.y,
      theta: m.theta ?? 0,
      dock: m.name === dock || m.type === 11,
    })),
    lines: (raw.lines ?? [])
      .map((l) => ({ name: l.name, points: (l.points ?? []).map(([x, y]) => ({ x, y })) }))
      .filter((l) => l.points.length >= 2),
    maps: (raw.maps ?? []).flatMap((m) => (m.floors?.length ? m.floors : [1]).map((floor) => ({ name: m.name, floor }))),
  };
}

/** A point of the map frame on the picture, in picture pixels. */
export function worldToPixel(m: MapInfo, x: number, y: number): { x: number; y: number } {
  return { x: (x - m.originX) / m.resolution, y: m.height - (y - m.originY) / m.resolution };
}

/** A picture pixel in the map frame. */
export function pixelToWorld(m: MapInfo, px: number, py: number): { x: number; y: number } {
  return { x: m.originX + px * m.resolution, y: m.originY + (m.height - py) * m.resolution };
}

/** The whole picture inside a view of viewW x viewH, centred: its scale and top left corner in the view. */
export function fitMap(picW: number, picH: number, viewW: number, viewH: number): { scale: number; left: number; top: number } {
  if (picW <= 0 || picH <= 0 || viewW <= 0 || viewH <= 0) return { scale: 0, left: 0, top: 0 };
  const scale = Math.min(viewW / picW, viewH / picH);
  return { scale, left: (viewW - picW * scale) / 2, top: (viewH - picH * scale) / 2 };
}

/** The base takes letters, digits, _ and - only, at most 50 characters (lumi-wave MARKER_NAME). */
export const validMarkerName = (name: string): boolean => /^[A-Za-z0-9_-]{1,50}$/.test(name);

/** The next free name of the p1, p2, ... kind. */
export function nextMarkerName(taken: string[], prefix = 'p'): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

// ---------- zoom and pan of the map view (the + / - buttons, two fingers, one finger) ----------
/** 1: the whole map fits the view. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** Pixels of the map that always stay inside the view when it is pushed away. */
export const KEEP_PX = 80;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * The picture's top left corner in the view after zooming from z0 to z1 about the view point (cx, cy): the map point
 * under (cx, cy) stays there.
 */
export function zoomAbout(offset: { x: number; y: number }, z0: number, z1: number, cx: number, cy: number) {
  const k = z1 / z0;
  return { x: cx - (cx - offset.x) * k, y: cy - (cy - offset.y) * k };
}

/** The top left corner kept so that at least KEEP_PX of a w x h picture (drawn size) stays inside a viewW x viewH view. */
export function clampOffset(offset: { x: number; y: number }, w: number, h: number, viewW: number, viewH: number) {
  return {
    x: Math.min(viewW - KEEP_PX, Math.max(KEEP_PX - w, offset.x)),
    y: Math.min(viewH - KEEP_PX, Math.max(KEEP_PX - h, offset.y)),
  };
}

/** A drag on the picture (screen pixels, y down) as a heading in the map frame (rad, 0 along +x, + counter-clockwise). */
export const headingFromDrag = (dx: number, dy: number): number => Math.atan2(0 - dy, dx); // 0 - dy: never -0 (atan2(-0, -1) is -pi)

/** Lumi's base is 510 x 510 mm (lumi-wave docs/01_HARDWARE.md); drawn at this size on the map. */
export const LUMI_BASE_M = 0.51;
/** The smallest it is drawn when the map is zoomed far out, so it stays visible. */
export const MIN_FOOTPRINT_PX = 6;

/** The base's width on screen: metres per pixel of the map picture, and the picture's drawn scale. */
export const footprintPx = (resolution: number, scale: number): number =>
  Math.max(MIN_FOOTPRINT_PX, (LUMI_BASE_M / resolution) * scale);

/** Lidar points around the base ([x ahead, y left], m; lumi-wave /map/scan) placed at a pose of the map frame. */
export function scanToWorld(points: number[][], at: { x: number; y: number; theta: number }): { x: number; y: number }[] {
  const c = Math.cos(at.theta);
  const s = Math.sin(at.theta);
  return points.map(([px, py]) => ({ x: at.x + px * c - py * s, y: at.y + px * s + py * c }));
}
