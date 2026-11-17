// A route on the Map screen: markers driven one after another (lumi-wave POST /agv/route, as the old dashboard's
// "Go to" with several places). Loop goes there and back (a, b, c, b, a, ...) and needs the assistant (Greeter or
// Patrol on); without it the API refuses with 409.

/** No stop right after the same stop (p1, p1): Lumi is there already. */
const noRepeats = (stops: string[]): string[] => stops.filter((s, i) => i === 0 || s !== stops[i - 1]);

/** A marker added at the end; a marker may come again later (p1, p2, p1), but not right after itself. */
export function addStop(stops: string[], name: string): string[] {
  return stops[stops.length - 1] === name ? stops : [...stops, name];
}

/** The stop at `index` taken out; were its neighbours the same marker, they become one stop. */
export const removeStopAt = (stops: string[], index: number): string[] => noRepeats(stops.filter((_, i) => i !== index));

/** Stops whose markers are gone (deleted, another map) are dropped. */
export const keepKnown = (stops: string[], names: string[]): string[] => noRepeats(stops.filter((s) => names.includes(s)));

/** Each marker's places in the route (1-based), for its label on the map: p1 -> [1, 4]. */
export function stopNumbers(stops: string[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  stops.forEach((s, i) => m.set(s, [...(m.get(s) ?? []), i + 1]));
  return m;
}

export interface RouteProgress {
  stops: string[];
  /** The stop being driven to now, from 0. */
  index: number;
  phase: 'driving' | 'done' | 'cancelled' | 'failed';
}

/** lumi-wave GET /agv/route: {route, index, status}; status "driving to p3", "done", "cancelled" or "p3: <why>". */
export function toRouteProgress(raw: { route?: string[]; index?: number; status?: string } | null): RouteProgress | null {
  if (!raw?.route?.length) return null;
  const status = raw.status ?? '';
  const phase =
    status === 'done'
      ? 'done'
      : status === 'cancelled'
        ? 'cancelled'
        : status === 'starting' || status.startsWith('driving')
          ? 'driving'
          : 'failed';
  return { stops: raw.route, index: raw.index ?? 0, phase };
}

export const PAUSE_MAX_S = 60; // lumi-wave RouteBody.pause
export const ROUNDS_MAX = 99; // lumi-wave RouteBody.rounds; 0 = until stopped
