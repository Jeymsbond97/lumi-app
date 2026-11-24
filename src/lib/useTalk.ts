// What Lumi heard and said, read from the assistant's log while the Talk screen is open and the app in front.
// GET /assistant/log once read the whole of lumi.log on the Thor (about 6 s for a 900 MB log); since 2026-11-23 it reads
// only the log's end (api/server.py tail), so it is asked every TALK_POLL_MS, still one read at a time; a send asks
// again at once. GET /songs (cheap) says whether Lumi sings now, GET /assistant/status (the log's end too) its errors.
// CLEAN keeps a mark per view and robot in AsyncStorage: lines up to it stay hidden after a reload too (talk.ts
// afterMark). CONVERSATION and ALL WORDS keep lists of their own, so cleaning one leaves the other as it was.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { read, toSongs, type Song } from './commands';
import {
  afterMark,
  lastClock,
  logPath,
  mergeTalk,
  NO_MARKS,
  toMarks,
  toSinging,
  toTalk,
  toTalkErrors,
  type TalkErrors,
  type TalkLine,
  type TalkMarks,
  type TalkView,
} from './talk';

const marksKey = (baseUrl: string) => `talkMarks:${baseUrl}`;

/** The next read of the log this long after the last one ended. */
export const TALK_POLL_MS = 3000;
/** A read that has not answered in this long is lost (an older robot API reads the whole log: about 6 s). */
export const TALK_READ_MS = 20000;

export interface Talk {
  /** The conversation (CONVERSATION): words with Lumi, without what was not meant for it. */
  lines: TalkLine[];
  /** ALL WORDS: the conversation and what the mics caught that was not for Lumi. */
  allLines: TalkLine[];
  /** The last read as it came, cleaned or not: what Lumi is doing is read from it. */
  recent: TalkLine[];
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
  /** Empty one view: from here on it shows only lines newer than now; the other views stay as they are. */
  clean: (view: TalkView) => void;
  /** Whether each view was cleaned (its empty words say so). */
  cleaned: Record<TalkView, boolean>;
}

export function useTalk(baseUrl: string, focused: boolean): Talk {
  const [lines, setLines] = useState<TalkLine[]>([]);
  const [allLines, setAllLines] = useState<TalkLine[]>([]);
  const [recent, setRecent] = useState<TalkLine[]>([]);
  const [newest, setNewest] = useState<string | null>(null);
  const [phase, setPhase] = useState<Talk['phase']>('reading');
  const [songs, setSongs] = useState<Song[]>([]);
  const [singing, setSinging] = useState<string | null>(null);
  const [errors, setErrors] = useState<TalkErrors | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const kick = useRef<() => void>(() => {});
  const marks = useRef<TalkMarks>(NO_MARKS);
  // the robot whose marks are read (a new robot: wait for its marks before the first read)
  const [marksFor, setMarksFor] = useState<string | null>(null);
  const [cleaned, setCleaned] = useState<Record<TalkView, boolean>>({ talk: false, all: false, errors: false });
  // the newest line of the last read, the mark a CLEAN keeps
  const newestTalk = useRef<string | null>(null);
  const newestError = useRef<string | null>(null);
  const cleanedOf = (m: TalkMarks) => ({ talk: m.talk !== null, all: m.all !== null, errors: m.errors !== null });

  useEffect(() => {
    let on = true;
    AsyncStorage.getItem(marksKey(baseUrl))
      .then(toMarks, () => NO_MARKS)
      .then((m) => {
        if (!on) return;
        marks.current = m;
        setCleaned(cleanedOf(m));
        setMarksFor(baseUrl);
      });
    return () => {
      on = false;
    };
  }, [baseUrl]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const active = focused && foreground && marksFor === baseUrl;
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
        const read = toTalk(log);
        if (read.length) newestTalk.current = read[read.length - 1].key;
        setRecent(read);
        const after = (mark: string | null) => afterMark(read, mark, (l) => l.key);
        setLines((prev) => mergeTalk(prev, after(marks.current.talk).filter((l) => l.kind !== 'overheard')));
        setAllLines((prev) => mergeTalk(prev, after(marks.current.all)));
      }
      if (st !== null) {
        const e = toTalkErrors(st);
        if (e.lines.length) newestError.current = e.lines[e.lines.length - 1];
        setErrors({ ...e, lines: afterMark(e.lines, marks.current.errors, (l) => l) });
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
  const add = useCallback((line: TalkLine) => {
    setLines((prev) => mergeTalk(prev, [line]));
    setAllLines((prev) => mergeTalk(prev, [line]));
  }, []);

  const clean = useCallback(
    (view: TalkView) => {
      const mark = view === 'errors' ? newestError.current : newestTalk.current;
      if (mark !== null) {
        const m = { ...marks.current, [view]: mark };
        marks.current = m;
        setCleaned(cleanedOf(m));
        AsyncStorage.setItem(marksKey(baseUrl), JSON.stringify(m)).catch(() => {});
      }
      if (view === 'talk') setLines([]);
      else if (view === 'all') setAllLines([]);
      else setErrors((e) => (e ? { ...e, lines: [] } : e));
    },
    [baseUrl],
  );

  return { lines, allLines, recent, newest, phase, songs, singing, errors, refresh, add, clean, cleaned };
}
