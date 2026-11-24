// The Talk screen: what Lumi heard and said, read from the assistant's log (GET /assistant/log, lumi-wave
// assistant/lumi.py log()), and what the screen sends. Plain data in and out, tested in __tests__/talk.test.ts.
//
// The lines it reads (lumi.py, 2026-11-23):
//   "15:06:24 WAKE 'Lumi. Lumi.': voice at -54 deg (confidence 0.22, calibrated)"   the wake word, heard
//   "15:06:34 visitor #9426: Lumi. Lumi  [english, confidence -0.54]"               a person's words in a talk
//   "15:06:35 lumi (1.6 s, voice after 1.6 s): Hi!"                                 Lumi's answer
//   "15:06:35   goodbye: See you later!"                                            Lumi's goodbye
//   "16:57:29   heard 'Oh boy.' (no wake word)"                                     words not meant for Lumi
//   "15:06:35   singing ATEEZ_BAD"                                                  a song starts
//   "15:06:35 person #9426 left - stop talking", "... conversation over ..."        the talk has ended
//   "09:03:51 dashboard: heard "                                                    the next words were typed
//   "=== 2026-11-23 Monday ==="                                                     a new day (or a start)
import type { Lang, TextKey } from './i18n';
import type { Modes } from './api';
import { assistantTalks } from './commands';

/** How many log lines one read asks for: the log is mostly "see #" lines (every 3 s), so 600 is about half an hour. */
export const LOG_LINES = 600;
export const logPath = (lines = LOG_LINES) => `/assistant/log?lines=${lines}`;

export type Speaker = 'person' | 'lumi';
export type TalkKind =
  /** words said, by a person or by Lumi */
  | 'words'
  /** the wake word that opened a talk */
  | 'wake'
  /** words the mics caught that were not for Lumi */
  | 'overheard'
  /** a song starts (`text` is the song id) */
  | 'song'
  /** the talk has ended */
  | 'end';

export interface TalkLine {
  /** Same line, same key, whichever read it came in. */
  key: string;
  /** The robot's clock: "HH:MM" to show. */
  time: string;
  /** "HH:MM:SS"; empty for a line from this app. */
  clock: string;
  kind: TalkKind;
  who: Speaker;
  text: string;
  /** The language it was said in; null when not known. */
  lang: Lang | null;
  /** Typed in an app (the dashboard's or this one's box), not said. */
  typed: boolean;
  /** Said or asked from this app while the assistant was off: not in the robot's log. */
  local?: boolean;
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
export const langOf = (text: string): Lang => (HANGUL.test(text) ? 'ko' : 'en');

const TIME = String.raw`(\d{2}):(\d{2}):(\d{2})`;
const RE = {
  day: /^=== \d{4}-\d{2}-\d{2}/,
  wake: new RegExp(`^${TIME} WAKE (['"])(.*)\\4: voice at`),
  visitor: new RegExp(`^${TIME} visitor #[^:]+: (.*?)\\s+\\[(\\w+), confidence [^\\]]*\\]$`),
  lumi: new RegExp(`^${TIME} lumi \\([^)]*\\): (.+)$`),
  goodbye: new RegExp(`^${TIME} +goodbye: (.+)$`),
  overheard: new RegExp(`^${TIME} +heard (['"])(.*)\\4 \\(no wake word\\)`),
  song: new RegExp(`^${TIME} +singing (\\S+)`),
  end: new RegExp(`^${TIME} .*(?:left - stop talking|conversation over|- goodbye, drive on)`),
  typed: new RegExp(`^${TIME} dashboard: heard`),
};

const whisperLang = (w: string): Lang | null => (w === 'korean' ? 'ko' : w === 'english' ? 'en' : null);

/** A line of words, or null for every other log line. */
function lineOf(raw: string): Omit<TalkLine, 'key' | 'typed'> | null {
  let m: RegExpMatchArray | null;
  const make = (m: RegExpMatchArray, kind: TalkKind, who: Speaker, text: string, lang: Lang | null) => {
    const t = text.trim();
    return t ? { time: `${m[1]}:${m[2]}`, clock: `${m[1]}:${m[2]}:${m[3]}`, kind, who, text: t, lang } : null;
  };
  if ((m = raw.match(RE.visitor))) return make(m, 'words', 'person', m[4], whisperLang(m[5]) ?? langOf(m[4]));
  if ((m = raw.match(RE.lumi))) return make(m, 'words', 'lumi', m[4], langOf(m[4]));
  if ((m = raw.match(RE.goodbye))) return make(m, 'words', 'lumi', m[4], langOf(m[4]));
  if ((m = raw.match(RE.wake))) return make(m, 'wake', 'person', m[5], langOf(m[5]));
  if ((m = raw.match(RE.overheard))) return make(m, 'overheard', 'person', m[5], langOf(m[5]));
  if ((m = raw.match(RE.song))) return make(m, 'song', 'lumi', m[4], null);
  if ((m = raw.match(RE.end))) return make(m, 'end', 'lumi', 'end', null);
  return null;
}

/**
 * The talk in the log lines, oldest first. Two ends in a row are one; the same words at the same second get their
 * own keys (a person saying "Lumi" twice). A key has no date: one read may hold the day's line, a later one not.
 */
export function parseTalkLog(lines: unknown): TalkLine[] {
  if (!Array.isArray(lines)) return [];
  const out: TalkLine[] = [];
  let typedNext = false;
  const seen = new Map<string, number>();
  for (const raw of lines) {
    if (typeof raw !== 'string' || RE.day.test(raw)) continue;
    if (RE.typed.test(raw)) {
      typedNext = true;
      continue;
    }
    const line = lineOf(raw);
    if (!line) continue;
    if (line.kind === 'end' && (out.length === 0 || out[out.length - 1].kind === 'end')) continue;
    const typed = typedNext && line.who === 'person' && line.kind === 'words';
    if (typed) typedNext = false;
    const id = `${line.clock}|${line.kind}|${line.who}|${line.text}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    out.push({ ...line, key: `${id}|${n}`, typed });
  }
  return out;
}

/** The talk lines out of a GET /assistant/log reply ({lumi_log: [...], console: [...]}). */
export const toTalk = (raw: unknown): TalkLine[] => parseTalkLog((raw as { lumi_log?: unknown } | null)?.lumi_log);

/** The newest log line's clock ("HH:MM:SS"): lines come every few seconds while the assistant runs. */
export function lastClock(raw: unknown): string | null {
  const lines = (raw as { lumi_log?: unknown } | null)?.lumi_log;
  if (!Array.isArray(lines)) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const m = typeof l === 'string' ? l.match(/^(\d{2}:\d{2}:\d{2}) /) : null;
    if (m) return m[1];
  }
  return null;
}

/** How many lines the screen keeps. */
export const KEEP_LINES = 200;

/**
 * Lines already shown plus the new ones of a read, in order: a read covers only the log's last lines, so what has
 * scrolled out of it stays. Lines from this app (local) keep their place.
 */
export function mergeTalk(prev: TalkLine[], next: TalkLine[], keep = KEEP_LINES): TalkLine[] {
  const have = new Set(prev.map((l) => l.key));
  const added = next.filter((l) => !have.has(l.key));
  if (!added.length) return prev;
  const all = [...prev, ...added];
  // an end right after an end (one read ended in it, the next one starts with it) is one
  const out = all.filter((l, i) => !(l.kind === 'end' && (i === 0 || all[i - 1].kind === 'end')));
  return out.slice(-keep);
}

/** A line this app adds itself: words said or an answer given while the assistant is off (they are not in the log). */
export function localLine(who: Speaker, text: string, now: Date, typed: boolean): TalkLine {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return {
    key: `local|${now.getTime()}|${who}|${text}`,
    time: `${hh}:${mm}`,
    clock: '',
    kind: 'words',
    who,
    text,
    lang: langOf(text),
    typed,
    local: true,
  };
}

// ---------- what the assistant is doing ----------
export type TalkState = 'off' | 'listening' | 'talking' | 'singing';

export const TALK_STATE_TEXT: Record<TalkState, TextKey> = {
  off: 'talkStateOff',
  listening: 'talkStateListening',
  talking: 'talkStateTalking',
  singing: 'talkStateSinging',
};

/** A talk is open this long after its last words, unless the log says it ended (lumi.py waits 20 s for more). */
export const TALK_OPEN_S = 45;

const secs = (clock: string) => {
  const [h, m, s] = clock.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

/**
 * Singing while /songs says so; off without Greeter or Patrol (lumi.py does not run then); talking while a talk is
 * open in the log (words since the last end, the newest of them at most TALK_OPEN_S before the newest log line);
 * listening otherwise.
 */
export function talkState(modes: Modes | null, lines: TalkLine[], newest: string | null, singing: boolean): TalkState {
  if (singing) return 'singing';
  if (!assistantTalks(modes)) return 'off';
  const talk = lines.filter((l) => !l.local && l.kind !== 'overheard');
  const last = talk[talk.length - 1];
  if (!last || last.kind === 'end' || last.kind === 'song' || !newest || !last.clock) return 'listening';
  const age = (secs(newest) - secs(last.clock) + 86400) % 86400;
  return age <= TALK_OPEN_S ? 'talking' : 'listening';
}

/** The song GET /songs says Lumi sings now (its id), or null. */
export function toSinging(raw: unknown): string | null {
  const s = (raw as { singing?: unknown } | null)?.singing;
  if (typeof s === 'string' && s) return s;
  if (s && typeof s === 'object') {
    const id = (s as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : null;
  }
  return null;
}

// ---------- quick phrases ----------

/** The assistant's trouble (GET /assistant/status): its log's lines with an error, failed, stuck, refused, cannot or
 *  traceback in them (newest last), and whether its main loop is stuck; nothing when the reply has none. */
export interface TalkErrors {
  lines: string[];
  stuck: boolean;
}
export function toTalkErrors(raw: unknown): TalkErrors {
  const r = raw as { errors?: unknown; stuck?: unknown } | null;
  const lines = Array.isArray(r?.errors) ? r.errors.filter((l): l is string => typeof l === 'string' && l.trim() !== '') : [];
  return { lines, stuck: r?.stuck === true };
}

// ---------- CLEAN ----------
// CLEAN empties the view in front only (owner, 2026-11-24: CONVERSATION, ALL WORDS and ERRORS each on their own), on
// the screen, not in the robot's log (yesterday's lines stayed). Each view keeps a mark:
// the newest line it had when cleaned. A read shows only what comes after the mark; when the mark has scrolled out of
// the read, everything in it is newer (the log only grows at its end).

/** The Talk screen's views: the conversation, all words the mics caught, the assistant's errors. */
export type TalkView = 'talk' | 'all' | 'errors';
export const TALK_VIEWS: TalkView[] = ['talk', 'all', 'errors'];

/** The newest line each view had when it was cleaned; null: never cleaned. */
export type TalkMarks = Record<TalkView, string | null>;
export const NO_MARKS: TalkMarks = { talk: null, all: null, errors: null };

/** What comes after the mark (by `id`), oldest first as given. */
export function afterMark<T>(items: T[], mark: string | null, id: (x: T) => string): T[] {
  if (mark === null) return items;
  for (let i = items.length - 1; i >= 0; i--) if (id(items[i]) === mark) return items.slice(i + 1);
  return items;
}

/** The marks kept in AsyncStorage; anything else is no marks. */
export function toMarks(raw: string | null): TalkMarks {
  try {
    const m = raw ? (JSON.parse(raw) as Partial<Record<TalkView, unknown>>) : null;
    const one = (v: TalkView) => (typeof m?.[v] === 'string' ? (m[v] as string) : null);
    return { talk: one('talk'), all: one('all'), errors: one('errors') };
  } catch {
    return NO_MARKS;
  }
}

// ---------- what to do about an error ----------
// Each error line gets the likeliest fix under it (owner, 2026-11-24). The rules follow the error lines lumi.log had
// on 2026-11-24 (lumi.py log(): "head error", "<call> failed", "... refused: <reason>", "drive to ... STUCK", ...);
// the first rule that matches wins, so the narrow ones come first.
const FIXES: [RegExp, TextKey][] = [
  [/not powered|not enabled|powered \/ enabled/i, 'fixArmOff'],
  [/STUCK: the base has not moved/, 'fixBaseStuck'],
  [/Patrol is off/i, 'fixPatrolOff'],
  [/on the charger/i, 'fixOnCharger'],
  [/holding something|hand is full/i, 'fixHandFull'],
  [/busy with another task|다른 일을/i, 'fixBusy'],
  [/while I'm moving/i, 'fixMoving'],
  [/position I don't know/i, 'fixArmUnknown'],
  [/too thin|too (big|small|wide|heavy)/i, 'fixThing'],
  [/move failed|stopped before the target|not there after/i, 'fixArmMove'],
  [/^\S+ status failed/, 'fixBase'],
  [/head error/i, 'fixHead'],
  [/camera/i, 'fixCamera'],
  [/traceback|\w+Error\(|\w+Error:|error: \w+Error/, 'fixCode'],
  [/connection refused|errno 111/i, 'fixRefused'],
  [/timed out|timeout/i, 'fixTimeout'],
  [/refused/i, 'fixRefusedAsk'],
];

/** The fix to show under an error line. */
export function errorFix(line: string): TextKey {
  for (const [re, key] of FIXES) if (re.test(line)) return key;
  return 'fixOther';
}
