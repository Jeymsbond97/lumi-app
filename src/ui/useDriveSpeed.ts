// The two speed sliders (lib/speed):
// - the arm's (Commands, ARM SETUP) is the robot's global arm speed: read with GET /arm/speed while the screen shows, set with POST /arm/speed
//   when the finger lifts or 300 ms after the last minus / plus tap. An older robot API (404) has none: 'old'.
// - the body's (Drive) is the app's own, kept in AsyncStorage.
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NeedsUpdateError } from '../lib/api';
import { getArmSpeed, setArmSpeed } from '../lib/arm';
import type { Reply } from '../lib/commands';
import { BODY_SPEED_DEFAULT, BODY_SPEED_RANGE, toArmSpeed, toStoredPercent, type ArmSpeed } from '../lib/speed';

const STEP_WAIT_MS = 300;
const RETRY_MS = 5000;
const BODY_KEY = 'lumi.drive.bodySpeed';

export type ArmSpeedState = { kind: 'loading' } | { kind: 'old' } | { kind: 'ready'; speed: ArmSpeed };
export type Refusal = Extract<Reply, { ok: false }>;

export interface ArmSpeedControl {
  state: ArmSpeedState;
  /** The finger moves: shown at once, not sent. */
  change: (percent: number) => void;
  /** The finger lifted: sent now. */
  release: (percent: number) => void;
  /** Minus or plus: sent once the taps pause. */
  step: (percent: number) => void;
}

export function useArmSpeed(baseUrl: string, active: boolean, onRefused: (r: Refusal) => void): ArmSpeedControl {
  const [state, setState] = useState<ArmSpeedState>({ kind: 'loading' });
  const url = useRef(baseUrl);
  const refused = useRef(onRefused);
  useEffect(() => {
    url.current = baseUrl;
    refused.current = onRefused;
  }, [baseUrl, onRefused]);
  /** A change the robot has not answered yet: a reading must not move the slider back meanwhile. */
  const changing = useRef(false);
  /** Counts sends, so only the last answer is shown. */
  const sent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let on = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const read = () =>
      getArmSpeed(baseUrl).then(
        (speed) => {
          if (on && !changing.current) setState({ kind: 'ready', speed });
        },
        (e) => {
          if (!on) return;
          if (e instanceof NeedsUpdateError) setState({ kind: 'old' });
          else retry = setTimeout(read, RETRY_MS);
        },
      );
    read();
    return () => {
      on = false;
      clearTimeout(retry);
    };
  }, [active, baseUrl]);

  const show = useCallback((percent: number) => {
    setState((s) => (s.kind === 'ready' ? { kind: 'ready', speed: { ...s.speed, percent } } : s));
  }, []);

  const send = useCallback((percent: number) => {
    clearTimeout(timer.current);
    pending.current = null;
    changing.current = true;
    const mine = ++sent.current;
    setArmSpeed(url.current, percent).then((r) => {
      if (mine !== sent.current) return;
      changing.current = false;
      const speed = r.ok ? toArmSpeed(r.data) : null;
      if (speed) setState({ kind: 'ready', speed });
      if (r.ok) return;
      refused.current(r);
      // show what the robot has, not what was asked
      getArmSpeed(url.current).then(
        (s) => mine === sent.current && setState({ kind: 'ready', speed: s }),
        () => {},
      );
    });
  }, []);

  const change = useCallback(
    (percent: number) => {
      clearTimeout(timer.current);
      pending.current = null;
      changing.current = true;
      show(percent);
    },
    [show],
  );

  const step = useCallback(
    (percent: number) => {
      change(percent);
      pending.current = percent;
      timer.current = setTimeout(() => send(percent), STEP_WAIT_MS);
    },
    [change, send],
  );

  // a tap still waiting is sent when the screen goes away
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) setArmSpeed(url.current, pending.current).catch(() => {});
    },
    [],
  );

  return { state, change, release: send, step };
}

/** The body's speed in percent and a way to keep it. */
export function useBodySpeed(): { percent: number; change: (p: number) => void; save: (p: number) => void } {
  const [percent, setPercent] = useState(BODY_SPEED_DEFAULT);
  const touched = useRef(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const v = toStoredPercent(await AsyncStorage.getItem(BODY_KEY), BODY_SPEED_RANGE);
        if (on && v !== null && !touched.current) setPercent(v);
      } catch {
        // no stored speed: the default stays
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const change = useCallback((p: number) => {
    touched.current = true;
    setPercent(p);
  }, []);

  const save = useCallback(
    (p: number) => {
      change(p);
      (async () => {
        try {
          await AsyncStorage.setItem(BODY_KEY, String(p));
        } catch {
          // kept for this session only
        }
      })();
    },
    [change],
  );

  return { percent, change, save };
}
