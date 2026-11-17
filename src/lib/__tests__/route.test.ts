import { addStop, keepKnown, removeStopAt, stopNumbers, toRouteProgress } from '../route';

describe('picking a route', () => {
  it('adds markers at the end; one may come again, not right after itself', () => {
    let s: string[] = [];
    for (const n of ['p1', 'p2', 'p3', 'p1', 'p1', 'p5', 'p2']) s = addStop(s, n);
    expect(s).toEqual(['p1', 'p2', 'p3', 'p1', 'p5', 'p2']);
  });

  it('takes one stop out, and joins its neighbours when they are the same marker', () => {
    expect(removeStopAt(['p1', 'p2', 'p3'], 1)).toEqual(['p1', 'p3']);
    expect(removeStopAt(['p1', 'p2', 'p1', 'p4'], 1)).toEqual(['p1', 'p4']);
  });

  it('drops stops whose markers are gone, without leaving p1, p1', () => {
    expect(keepKnown(['p1', 'gone', 'p2'], ['p1', 'p2', 'p9'])).toEqual(['p1', 'p2']);
    expect(keepKnown(['p1', 'gone', 'p1'], ['p1'])).toEqual(['p1']);
  });

  it('numbers each marker by its places in the route', () => {
    expect(stopNumbers(['p1', 'p2', 'p1'])).toEqual(
      new Map([
        ['p1', [1, 3]],
        ['p2', [2]],
      ]),
    );
  });
});

describe('toRouteProgress', () => {
  it('reads the progress the API keeps', () => {
    expect(toRouteProgress({ route: ['p1', 'p2'], index: 1, status: 'driving to p2' })).toEqual({
      stops: ['p1', 'p2'],
      index: 1,
      phase: 'driving',
    });
    expect(toRouteProgress({ route: ['p1'], index: 0, status: 'starting' })?.phase).toBe('driving');
    expect(toRouteProgress({ route: ['p1'], index: 0, status: 'done' })?.phase).toBe('done');
    expect(toRouteProgress({ route: ['p1'], index: 0, status: 'cancelled' })?.phase).toBe('cancelled');
    expect(toRouteProgress({ route: ['p1'], index: 0, status: 'p1: AGV refused (busy)' })?.phase).toBe('failed');
  });

  it('is nothing before any route', () => {
    expect(toRouteProgress({})).toBeNull();
    expect(toRouteProgress(null)).toBeNull();
  });
});
