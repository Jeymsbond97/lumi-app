// What Lumi heard and said, read from the assistant's log while the Talk screen is open and the app in front.
// GET /assistant/log reads the whole of lumi.log on the Thor (about 6 s for a 900 MB log, 2026-11-23), so it is asked
// one read at a time and TALK_POLL_MS after the last one ended; a send asks again at once. GET /songs (cheap) says
// whether Lumi sings now.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { read, toSongs, type Song } from './commands';
import { lastClock, logPath, mergeTalk, toSinging, toTalk, type TalkLine } from './talk';

/** The next read of the log this long after the last one ended. */
export const TALK_POLL_MS = 8000;
/** The log answers in about 6 s; this long is a read that is lost. */
export const TALK_READ_MS = 20000;

export interface Talk {
  lines: TalkLine[];
  /** The newest log line's clock, "HH:MM:SS". */
  newest: string | null;
  /** 'reading' until the first answer; 'lost' while the log does not answer. */
  phase: 'reading' | 'ok' | 'lost';
  songs: Song[];
  /** The id of the song Lumi sings now. */
  singing: string | null;
  /** Read again now (after a send). */
  refresh: () => void;
  /** Add a line of this app's own (words said while the assistant is off). */
  add: (line: TalkLine) => void;
}

export function useTalk(baseUrl: string, focused: boolean): Talk {
  const [lines, setLines] = useState<TalkLine[]>([]);
  const [newest, setNewest] = useState<string | null>(null);
  const [phase, setPhase] = useState<Talk['phase']>('reading');
  const [songs, setSongs] = useState<Song[]>([]);
  const [singing, setSinging] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const active = focused && foreground;
  useEffect(() => {
    if (!active) return;
    let on = true;
    let busy = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      clearTimeout(timer);
      if (busy) {
        again = true; // a send while a read is on its way: one more right after it
        return;
      }
      busy = true;
      const [log, s] = await Promise.all([read(baseUrl, logPath(), TALK_READ_MS), read(baseUrl, '/songs', 4000)]);
      busy = false;
      if (!on) return;
      if (log === null) setPhase('lost'); // the lines already shown stay
      else {
        setPhase('ok');
        setNewest(lastClock(log));
        setLines((prev) => mergeTalk(prev, toTalk(log)));
      }
      if (s !== null) {
        setSongs(toSongs(s));
        setSinging(toSinging(s));
      }
      const wait = again ? 0 : TALK_POLL_MS;
      again = false;
      timer = setTimeout(tick, wait);
    };
    kick.current = tick;
    tick();
    return () => {
      on = false;
      kick.current = () => {};
      clearTimeout(timer);
    };
  }, [baseUrl, active]);

  const refresh = useCallback(() => kick.current(), []);
  const add = useCallback((line: TalkLine) => setLines((prev) => mergeTalk(prev, [line])), []);
  return { lines, newest, phase, songs, singing, refresh, add };
}
