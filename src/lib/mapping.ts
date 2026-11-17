// Making a new map (MAPPING on the Map screen): lumi-wave /map/scan/* (api/server.py), which drives the base's own map
// builder (Thor docs/05_AGV_BASE.md §7). While it scans, the growing map comes as a picture with its geometry, Lumi's
// pose and the optimizing progress come with the state.
import type { MapInfo } from './mapGeom';

export interface ScanState {
  /** A new map is being made on the base (by the app or the base's own page). */
  mapping: boolean;
  name: string;
  floor: number;
  /** Where Lumi is on the new map (m, rad), null when the base does not say. */
  pose: { x: number; y: number; theta: number } | null;
  /** How far the base has optimized the map, 0 to 1; null when it does not say (it says it now and then). */
  progress: number | null;
}

interface RawScanState {
  mapping?: boolean;
  name?: string;
  floor?: number;
  pose?: { x?: number; y?: number; theta?: number } | null;
  progress?: number | null;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function toScanState(raw: RawScanState): ScanState {
  const p = raw.pose;
  return {
    mapping: raw.mapping === true,
    name: raw.name ?? '',
    floor: num(raw.floor) ? raw.floor : 1,
    pose: p && num(p.x) && num(p.y) ? { x: p.x, y: p.y, theta: num(p.theta) ? p.theta : 0 } : null,
    progress: num(raw.progress) ? Math.min(1, Math.max(0, raw.progress)) : null,
  };
}

export interface ScanPicture {
  /** The new map's geometry as the Map screen draws a map (no markers, no lines yet). */
  info: MapInfo;
  /** The picture itself (a data URI). */
  uri: string;
  /** False when the picture's own geometry was not seen yet (the map just grew): it may sit a little off. */
  exact: boolean;
}

interface RawScanPicture {
  width?: number;
  height?: number;
  resolution?: number;
  origin_x?: number;
  origin_y?: number;
  exact?: boolean;
  png?: string;
}

export function toScanPicture(raw: RawScanPicture, name: string, floor: number): ScanPicture | null {
  if (!raw.png || !num(raw.width) || !num(raw.height) || raw.width <= 0 || raw.height <= 0) return null;
  return {
    info: {
      name,
      floor,
      width: raw.width,
      height: raw.height,
      resolution: num(raw.resolution) && raw.resolution > 0 ? raw.resolution : 0.05,
      originX: num(raw.origin_x) ? raw.origin_x : 0,
      originY: num(raw.origin_y) ? raw.origin_y : 0,
      markers: [],
      lines: [],
      maps: [],
    },
    uri: `data:image/png;base64,${raw.png}`,
    exact: raw.exact !== false,
  };
}

/**
 * The picture to show next: a new one whose geometry is known, or any while there is none yet. A picture that came
 * apart from its geometry would draw Lumi off its place for a moment, so the last good one stays instead.
 */
export const keepPicture = (shown: ScanPicture | null, next: ScanPicture | null): ScanPicture | null =>
  next && (next.exact || !shown) ? next : shown;

/** The base's map tool takes letters, digits and _ only, at most 36; a name in MAPS would overwrite that map. */
export const validNewMapName = (name: string, taken: string[]): boolean => /^[A-Za-z0-9_]{1,36}$/.test(name) && !taken.includes(name);

/** Optimizing progress as the bar shows it: 63%. */
export const progressText = (p: number): string => `${Math.floor(Math.min(1, Math.max(0, p)) * 100)}%`;

/** Saving before the base has optimized the map gives a worse map: ask first. Unknown progress does not warn. */
export const saveEarly = (p: number | null): boolean => p !== null && p < 1;
