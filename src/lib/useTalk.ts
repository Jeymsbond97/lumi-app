// What Lumi heard and said, read from the assistant's log while the Talk screen is open and the app in front.
// GET /assistant/log once read the whole of lumi.log on the Thor (about 6 s for a 900 MB log); since 2026-11-23 it reads
// only the log's end (api/server.py tail), so it is asked every TALK_POLL_MS, still one read at a time; a send asks
// again at once. GET /songs (cheap) says whether Lumi sings now, GET /assistant/status (the log's end too) its errors.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { read, toSongs, type Song } from './commands';
import { lastClock, logPath, mergeTalk, toSinging, toTalk, toTalkErrors, type TalkErrors, type TalkLine } from './talk';

/** The next read of the log this long after the last one ended. */
export const TALK_POLL_MS = 3000;
/** A read that has not answered in this long is lost (an older robot API reads the whole log: about 6 s). */
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
  /** The assistant's errors; null until the first answer. */
  errors: TalkErrors | null;
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
  const [errors, setErrors] = useState<TalkErrors | null>(null);
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
      const [log, s, st] = await Promise.all([
        read(baseUrl, logPath(), TALK_READ_MS),
        read(baseUrl, '/songs', 4000),
        read(baseUrl, '/assistant/status', TALK_READ_MS),
      ]);
      busy = false;
      if (!on) return;
      if (log === null) setPhase('lost'); // the lines already shown stay
      else {
        setPhase('ok');
        setNewest(lastClock(log));
        setLines((prev) => mergeTalk(prev, toTalk(log)));
      }
      if (st !== null) setErrors(toTalkErrors(st));
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
  return { lines, newest, phase, songs, singing, errors, refresh, add };
}
