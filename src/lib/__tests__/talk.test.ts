import type { Modes } from '../api';
import { askRequest, sayRequest } from '../commands';
import {
  langOf,
  lastClock,
  localLine,
  logPath,
  mergeTalk,
  parseTalkLog,
  talkState,
  toSinging,
  toTalk,
  toTalkErrors,
} from '../talk';

// lines as lumi.log has them (GET /assistant/log on the Thor, 2026-11-23)
const LOG = [
  '15:06:20 see #2 3.18 m -35 deg, #7 3.58 m -23 deg',
  "15:06:24 WAKE 'Lumi. Lumi. Lumi.': voice at -54 deg (confidence 0.22, calibrated)",
  '15:06:24   look me: person at +12 deg, 4.48 m (nearest the voice)',
  '15:06:34 visitor #9426: Lumi. Lumi  [english, confidence -0.54]',
  '15:06:34   action unclear  (2.3 s)',
  '15:06:35 lumi (1.6 s, voice after 1.6 s): Hi!',
  '15:06:35 person #9426 left - stop talking',
  '=== 2026-11-23 Monday ===',
  "16:57:29   heard 'Oh boy.' (no wake word)",
  '16:33:03 visitor #31: 너무 추악, 안 돼있네요.  [korean, confidence -0.2]',
  '16:33:10 lumi (-0.0 s): 확인해 볼게요.',
  '16:33:12 lumi (3.2 s, openai): Sure.',
  '16:33:20   goodbye: See you later!',
  '16:33:21 voice conversation over (silence): the wake word or a wave again',
  '16:33:22   silence after a closing word - conversation over',
  '16:40:00 camera ok (head): 13.0 fps, 2 people in view, 0 broken frames skipped, 0 reopens',
];

const modes = (on: Partial<Modes>): Modes => ({ greeter: false, patrol: false, wave_greet: false, welcome: false, ...on });

describe('parseTalkLog', () => {
  const lines = parseTalkLog(LOG);

  it('keeps only what was heard and said, oldest first', () => {
    expect(lines.map((l) => [l.kind, l.who, l.text])).toEqual([
      ['wake', 'person', 'Lumi. Lumi. Lumi.'],
      ['words', 'person', 'Lumi. Lumi'],
      ['words', 'lumi', 'Hi!'],
      ['end', 'lumi', 'end'],
      ['overheard', 'person', 'Oh boy.'],
      ['words', 'person', '너무 추악, 안 돼있네요.'],
      ['words', 'lumi', '확인해 볼게요.'],
      ['words', 'lumi', 'Sure.'],
      ['words', 'lumi', 'See you later!'],
      ['end', 'lumi', 'end'],
    ]);
  });

  it('shows the clock to the minute and keeps the seconds', () => {
    expect(lines[1].time).toBe('15:06');
    expect(lines[1].clock).toBe('15:06:34');
  });

  it('takes the language whisper heard, else from the letters', () => {
    expect(lines[1].lang).toBe('en');
    expect(lines[5].lang).toBe('ko');
    expect(lines[6].lang).toBe('ko');
    expect(lines[7].lang).toBe('en');
  });

  it('reads a wake word quoted with double quotes (an apostrophe inside)', () => {
    const [l] = parseTalkLog([`10:00:00 WAKE "Lumi, what's up": voice at +3 deg (confidence 0.3, calibrated)`]);
    expect(l.text).toBe("Lumi, what's up");
  });

  it('marks words typed in a Command box', () => {
    const typed = parseTalkLog(['09:03:51 dashboard: heard ', '09:03:51 visitor #voice: look up  [english, confidence 0.0]', '09:03:55 lumi (2 s): Okay, I am looking up.']);
    expect(typed.map((l) => l.typed)).toEqual([true, false]);
  });

  it('gives the same words in the same second their own keys', () => {
    const twice = parseTalkLog(['10:00:00 visitor #1: Lumi  [english, confidence -0.1]', '10:00:00 visitor #1: Lumi  [english, confidence -0.1]']);
    expect(new Set(twice.map((l) => l.key)).size).toBe(2);
  });

  it('reads nothing out of a wrong reply', () => {
    expect(parseTalkLog(null)).toEqual([]);
    expect(parseTalkLog([1, null, 'not a line'])).toEqual([]);
    expect(toTalk({})).toEqual([]);
    expect(toTalk(null)).toEqual([]);
  });
});

describe('mergeTalk', () => {
  it('adds only the new lines of a later read and keeps what scrolled out of it', () => {
    const first = toTalk({ lumi_log: LOG.slice(0, 7) });
    const later = toTalk({ lumi_log: LOG.slice(5) }); // the window moved on: no day line either
    const merged = mergeTalk(first, later);
    expect(merged.map((l) => l.text)).toEqual(parseTalkLog(LOG).map((l) => l.text));
  });

  it('returns the same list when nothing is new', () => {
    const a = parseTalkLog(LOG);
    expect(mergeTalk(a, parseTalkLog(LOG))).toBe(a);
  });

  it('keeps the newest lines only', () => {
    const many = Array.from({ length: 30 }, (_, i) => `10:00:${String(i).padStart(2, '0')} lumi (1 s): line ${i}`);
    const kept = mergeTalk([], parseTalkLog(many), 10);
    expect(kept).toHaveLength(10);
    expect(kept[9].text).toBe('line 29');
  });

  it('puts a line of this app at the end', () => {
    const a = parseTalkLog(LOG);
    const mine = localLine('lumi', 'Hello, I am Lumi.', new Date(2026, 10, 23, 9, 5), true);
    const out = mergeTalk(a, [mine]);
    expect(out[out.length - 1]).toMatchObject({ text: 'Hello, I am Lumi.', time: '09:05', local: true, typed: true, lang: 'en' });
  });
});

describe('talkState', () => {
  const open = parseTalkLog(LOG.slice(0, 6)); // Lumi said "Hi!" at 15:06:35, nobody left yet

  it('is off while lumi.py does not run', () => {
    expect(talkState(modes({}), open, '15:06:40', false)).toBe('off');
    expect(talkState(null, open, '15:06:40', false)).toBe('off');
  });

  it('sings while /songs says so', () => {
    expect(talkState(modes({}), open, '15:06:40', true)).toBe('singing');
  });

  it('talks while a talk is open and recent', () => {
    expect(talkState(modes({ greeter: true }), open, '15:06:40', false)).toBe('talking');
    expect(talkState(modes({ patrol: true }), open, '15:10:00', false)).toBe('listening');
  });

  it('listens once the talk has ended', () => {
    expect(talkState(modes({ greeter: true }), parseTalkLog(LOG.slice(0, 7)), '15:06:36', false)).toBe('listening');
    expect(talkState(modes({ greeter: true }), [], '15:06:36', false)).toBe('listening');
  });

  it('counts over midnight', () => {
    const late = parseTalkLog(['23:59:50 visitor #1: hello  [english, confidence -0.1]']);
    expect(talkState(modes({ greeter: true }), late, '00:00:10', false)).toBe('talking');
  });

  it('is not moved by words overheard', () => {
    const lines = parseTalkLog([...LOG.slice(0, 7), "15:06:40   heard 'Oh boy.' (no wake word)"]);
    expect(talkState(modes({ greeter: true }), lines, '15:06:41', false)).toBe('listening');
  });
});

describe('readings', () => {
  it('finds the newest clock in the log', () => {
    expect(lastClock({ lumi_log: LOG })).toBe('16:40:00');
    expect(lastClock({ lumi_log: ['=== 2026-11-23 Monday ==='] })).toBeNull();
    expect(lastClock(null)).toBeNull();
  });

  it('reads the song sung now', () => {
    expect(toSinging({ songs: [], singing: null })).toBeNull();
    expect(toSinging({ songs: [], singing: 'ATEEZ_BAD' })).toBe('ATEEZ_BAD');
    expect(toSinging({ singing: { id: 'X' } })).toBe('X');
    expect(toSinging(null)).toBeNull();
  });

  it('asks the log for its last lines', () => {
    expect(logPath()).toBe('/assistant/log?lines=600');
    expect(logPath(50)).toBe('/assistant/log?lines=50');
  });

  it('tells Korean from English', () => {
    expect(langOf('안녕하세요')).toBe('ko');
    expect(langOf('Hello')).toBe('en');
  });
});

describe('what Talk sends', () => {
  it('says and asks on the speaker while the assistant is off', () => {
    expect(sayRequest('Hello', modes({}), 'en')).toMatchObject({ path: '/say', body: { text: 'Hello' } });
    expect(askRequest('What can you do', modes({}))).toMatchObject({ path: '/ask', body: { question: 'What can you do', speak: true } });
  });

  it('hands them to the assistant while it runs', () => {
    expect(sayRequest('안녕하세요', modes({ greeter: true }), 'ko')).toMatchObject({
      path: '/tasks/steps',
      body: { steps: [{ do: 'say', text: '안녕하세요' }], lang: 'ko' },
    });
    expect(askRequest('What can you do', modes({ patrol: true }))).toMatchObject({ path: '/tasks/command', body: { text: 'What can you do' } });
  });
});

describe('assistant errors', () => {
  it('reads the error lines and a stuck loop from /assistant/status', () => {
    expect(toTalkErrors({ errors: ['18:01:02 whisper failed: timeout', '', 3], stuck: true })).toEqual({
      lines: ['18:01:02 whisper failed: timeout'],
      stuck: true,
    });
    expect(toTalkErrors(null)).toEqual({ lines: [], stuck: false });
  });
});
