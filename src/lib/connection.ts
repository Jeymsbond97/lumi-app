// Finds Lumi's API on whichever network the phone or tablet is on.
// The robot Wi-Fi is tried first because that is how people normally connect next to the robot.

export type Route = 'robot-wifi' | 'office' | 'remote';

export interface Candidate {
  route: Route;
  baseUrl: string;
}

export const CANDIDATES: Candidate[] = [
  { route: 'robot-wifi', baseUrl: 'http://192.168.10.240:8100' },
  { route: 'office', baseUrl: 'http://192.168.0.250:8100' },
  { route: 'remote', baseUrl: 'http://100.74.120.24:8100' }, // Tailscale, lumi-thor
];

export interface Connection extends Candidate {
  latencyMs: number;
}

export async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probe(c: Candidate, timeoutMs: number): Promise<Connection> {
  const started = Date.now();
  const res = await fetchWithTimeout(`${c.baseUrl}/health`, timeoutMs);
  if (!res.ok) throw new Error(`${c.route}: HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) {
    throw new Error(`${c.route}: unexpected health reply`);
  }
  return { ...c, latencyMs: Date.now() - started };
}

/**
 * Tries every network at once and returns the first one that answers, preferring the
 * robot Wi-Fi when several answer within the same short window.
 */
export async function findLumi(timeoutMs = 2500): Promise<Connection> {
  const attempts = CANDIDATES.map((c) => probe(c, timeoutMs));
  const settled = await Promise.allSettled(attempts);
  const found = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (found.length === 0) throw new Error('Lumi did not answer on any network');
  return found.sort((a, b) => CANDIDATES.findIndex((c) => c.route === a.route) - CANDIDATES.findIndex((c) => c.route === b.route))[0];
}
