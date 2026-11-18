// The arm's joints about 5 times a second while the 3D Lumi is on screen, so the drawn arm moves as evenly as the
// real one (owner, 2026-11-18); the robot's round (lib/robot) asks them only once a second. The scene glides between
// these readings (web/home3d.html). A robot API without /arm/joints: null, and the once-a-second joints stay in use.
import { useEffect, useState } from 'react';
import { getLiveArmJoints, NeedsUpdateError } from './api';

/** One reading this often while the arm answers. */
export const LIVE_JOINTS_MS = 200;
/** After a failed reading (the arm controller busy or away), the next one this much later. */
export const LIVE_JOINTS_RETRY_MS = 1000;

export function useLiveJoints(baseUrl: string, active: boolean): number[] | null {
  const [joints, setJoints] = useState<number[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let on = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const started = Date.now();
      let wait = LIVE_JOINTS_MS;
      try {
        const j = await getLiveArmJoints(baseUrl);
        if (on) setJoints(j);
      } catch (e) {
        if (e instanceof NeedsUpdateError) return; // an older robot API: keep to the once-a-second joints
        if (on) setJoints(null);
        wait = LIVE_JOINTS_RETRY_MS;
      }
      if (on) timer = setTimeout(tick, Math.max(0, wait - (Date.now() - started)));
    };
    tick();
    return () => {
      on = false;
      clearTimeout(timer);
    };
  }, [baseUrl, active]);

  return active ? joints : null;
}
