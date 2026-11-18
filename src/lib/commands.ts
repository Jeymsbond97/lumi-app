// The Commands screen: what each action sends to lumi-api (lumi-wave api/server.py) and how the replies read.
// Everything here is plain data in and out, so it is tested without a robot (src/lib/__tests__/commands.test.ts).
import { fetchWithTimeout } from './connection';
import type { Lang, TextKey } from './i18n';
import type { Modes } from './api';

// ---------- one request ----------
export interface Request {
  path: string;
  body?: object;
  /** How long Lumi may take to answer: a wave or an arm pose answers when the move has ended. */
  timeoutMs?: number;
}

/** A command's answer: sent, refused (HTTP 4xx / 5xx with the robot's reason) or no answer at all (status 0). */
export type Reply = { ok: true; data: unknown } | { ok: false; status: number; reason: string | null };

/** The robot's reason in a refusal: FastAPI's {"detail": "..."} or, for a wrong field, {"detail": [{"msg": ...}]}. */
export function reasonOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const d = (body as { detail?: unknown }).detail;
  if (typeof d === 'string') return d.trim() || null;
  if (Array.isArray(d)) {
    const msgs = d.map((x) => (x && typeof x === 'object' ? (x as { msg?: unknown }).msg : null)).filter((m) => typeof m === 'string');
    return msgs.length ? msgs.join('; ') : null;
  }
  return null;
}

/** POSTs one command. Never throws: a refusal or a lost answer comes back as a Reply. */
export async function send(baseUrl: string, req: Request): Promise<Reply> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${baseUrl}${req.path}`, req.timeoutMs ?? 8000, {
      method: 'POST',
      headers: req.body ? { 'Content-Type': 'application/json' } : undefined,
      body: req.body ? JSON.stringify(req.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, reason: null };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // an empty or non JSON body
  }
  return res.ok ? { ok: true, data } : { ok: false, status: res.status, reason: reasonOf(data) };
}

/** GETs a reading; null when it does not answer (or the endpoint does not exist yet). */
export async function read(baseUrl: string, path: string, timeoutMs = 4000): Promise<unknown> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}${path}`, timeoutMs);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// The robot's own words for the refusals people meet most; shown in both languages. Others are shown as the robot says them.
const KNOWN_REASONS: [RegExp, TextKey][] = [
  [/switch on greeter or patrol first/i, 'cmdNeedModes'],
  [/switch on patrol for that/i, 'cmdNeedPatrol'],
  [/busy with a task/i, 'busy'],
  [/owns the robot/i, 'cmdAssistantOwns'],
  [/arm not ready/i, 'cmdNeedArm'],
  [/hand is empty|not holding anything/i, 'cmdNeedHolding'],
];

export function reasonKey(reason: string | null): TextKey | null {
  if (!reason) return null;
  return KNOWN_REASONS.find(([re]) => re.test(reason))?.[1] ?? null;
}

/** Puts {name} values into a text from i18n. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));
}

// ---------- what Lumi can take (tasks/fetch.py OBJECTS, COLOURS) ----------
export const OBJECTS = ['cup', 'bottle', 'apple', 'orange', 'banana'] as const;
export type ObjectName = (typeof OBJECTS)[number];
export const COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white', 'black', 'grey'] as const;
export type Colour = (typeof COLOURS)[number];

export const OBJECT_TEXT: Record<ObjectName, TextKey> = {
  cup: 'objCup',
  bottle: 'objBottle',
  apple: 'objApple',
  orange: 'objOrange',
  banana: 'objBanana',
};
export const COLOUR_TEXT: Record<Colour, TextKey> = {
  red: 'colRed',
  orange: 'colOrange',
  yellow: 'colYellow',
  green: 'colGreen',
  blue: 'colBlue',
  purple: 'colPurple',
  pink: 'colPink',
  white: 'colWhite',
  black: 'colBlack',
  grey: 'colGrey',
};

/** An object to take: a cup, or only the blue cup. */
export interface Thing {
  object: ObjectName;
  colour: Colour | null;
  /** The torso camera sees it now. */
  seen: boolean;
}

const isObject = (v: unknown): v is ObjectName => OBJECTS.includes(v as ObjectName);
const isColour = (v: unknown): v is Colour => COLOURS.includes(v as Colour);

/**
 * The choice of objects: the ones the torso camera sees now (GET /objects), nearest first and each once, then every
 * object Lumi knows in any colour.
 */
export function thingChoices(rawObjects: unknown): Thing[] {
  const list = (rawObjects as { objects?: unknown } | null)?.objects;
  const seen = (Array.isArray(list) ? list : [])
    .filter((o): o is { name: ObjectName; colour?: unknown; distance_m?: unknown } => !!o && isObject((o as { name?: unknown }).name))
    .sort((a, b) => dist(a.distance_m) - dist(b.distance_m));
  const out: Thing[] = [];
  for (const o of seen) {
    const colour = isColour(o.colour) ? o.colour : null;
    if (!out.some((t) => t.object === o.name && t.colour === colour)) out.push({ object: o.name, colour, seen: true });
  }
  for (const object of OBJECTS) out.push({ object, colour: null, seen: false });
  return out;
}
const dist = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 99);

export const thingId = (t: Thing) => `${t.colour ?? 'any'}:${t.object}${t.seen ? ':seen' : ''}`;

/** "blue cup", "cup". */
export function thingText(t: Thing, tr: (k: TextKey) => string): string {
  return t.colour ? `${tr(COLOUR_TEXT[t.colour])} ${tr(OBJECT_TEXT[t.object])}` : tr(OBJECT_TEXT[t.object]);
}

// ---------- readings for the choices ----------
/** Marker names on the current map (GET /agv/markers). */
export function toMarkers(raw: unknown): string[] {
  const m = (raw as { markers?: unknown } | null)?.markers;
  return Array.isArray(m) ? m.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

// the dashboard's order; poses taught later follow by name
const POSE_ORDER = ['look', 'carry', 'give', 'ready', 'rest', 'bag', 'wave_out', 'wave_start', 'wave'];

/** The arm's taught poses (GET /arm/poses: {name: joints}). */
export function toPoses(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const rank = (n: string) => (POSE_ORDER.indexOf(n) + 1 || 99);
  return Object.keys(raw)
    .filter((k) => Array.isArray((raw as Record<string, unknown>)[k]))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export interface Song {
  id: string;
  title: string;
  titleKo: string;
}

/** The songs Lumi sings (GET /songs: proposed Thor endpoint, see docs/COMMANDS.md). */
export function toSongs(raw: unknown): Song[] {
  const s = (raw as { songs?: unknown } | null)?.songs;
  if (!Array.isArray(s)) return [];
  return s.flatMap((x) => {
    const o = (x ?? {}) as { id?: unknown; title?: unknown; title_ko?: unknown };
    if (typeof o.id !== 'string' || typeof o.title !== 'string') return [];
    return [{ id: o.id, title: o.title, titleKo: typeof o.title_ko === 'string' && o.title_ko ? o.title_ko : o.title }];
  });
}

export const VOLUME_STEP = 10;
export function toVolume(raw: unknown): number | null {
  const p = (raw as { percent?: unknown } | null)?.percent;
  return typeof p === 'number' && Number.isFinite(p) ? Math.round(p) : null;
}
export const stepVolume = (v: number, by: number) => Math.min(100, Math.max(0, Math.round((v + by) / VOLUME_STEP) * VOLUME_STEP));

/** Whether Lumi holds something (GET /tasks/state "holding"); null when it does not say. */
export function toHolding(raw: unknown): boolean | null {
  const h = (raw as { holding?: unknown } | null)?.holding;
  return typeof h === 'boolean' ? h : null;
}

// ---------- the last skill (GET /skills/state) ----------
export type SkillStatus = 'idle' | 'running' | 'done' | 'refused' | 'stopped' | 'failed';
const SKILL_STATUSES: SkillStatus[] = ['idle', 'running', 'done', 'refused', 'stopped', 'failed'];

export interface SkillState {
  status: SkillStatus;
  skill: string | null;
  reason: string | null;
}

export function toSkillState(raw: unknown): SkillState | null {
  const o = (raw ?? {}) as { status?: unknown; skill?: unknown; reason?: unknown };
  const status = SKILL_STATUSES.find((s) => s === o.status);
  if (!status) return null;
  return {
    status,
    skill: typeof o.skill === 'string' ? o.skill : null,
    reason: typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim() : null,
  };
}

// ---------- what each action sends ----------
/** Where a fetch takes from or brings to: where Lumi is now, or a marker. */
export type Where = 'here' | { marker: string };
export type Finish = 'hold' | 'place';
export type CarryThen = 'hold' | 'place' | 'give';
export type DriveDir = 'forward' | 'back' | 'left' | 'right';
export type TurnWay = 'left' | 'right' | 'around';
export type LookDir = 'left' | 'right' | 'up' | 'down' | 'centre';

export const DRIVE_METRES = [0.5, 1, 2] as const;

/** A mission of steps (docs/17), the way /tasks/parse writes them. */
export const stepsRequest = (steps: object[], lang: Lang): Request => ({
  path: '/tasks/steps',
  body: { steps, lang, sender: null },
  timeoutMs: 10000,
});

/** Done by the assistant as if it heard the words (it must run: Greeter or Patrol on). */
export const commandRequest = (text: string): Request => ({ path: '/tasks/command', body: { text }, timeoutMs: 10000 });

export const pickRequest = (t: Thing, lang: Lang) => stepsRequest([{ do: 'pick', object: t.object, colour: t.colour }], lang);
export const receiveRequest = (t: Thing, lang: Lang) =>
  stepsRequest([{ do: 'receive', object: t.object, from_hand: true }], lang);
/** Pick it up and put it at a free spot nearby (a skill: /skills/state shows how it goes). */
export const asideRequest = (t: Thing): Request => ({ path: '/skills/move', body: { object: t.object, colour: t.colour } });
export const placeRequest: Request = { path: '/tasks/place', body: { on: null } };
export const giveRequest: Request = { path: '/tasks/give' };
export const releaseRequest: Request = { path: '/tasks/release' };
export const waveRequest: Request = { path: '/arm/wave', timeoutMs: 90000 };
export const poseRequest = (name: string): Request => ({ path: '/arm/pose', body: { name, speed: 'slow' }, timeoutMs: 90000 });
export const gripperRequest = (open: boolean): Request => ({ path: open ? '/gripper/open' : '/gripper/close', timeoutMs: 10000 });
export const comeRequest = commandRequest('come here');
export const followRequest = commandRequest('follow me');
export const goRequest = (marker: string): Request => ({ path: '/agv/go', body: { marker } });
/** "home" is the charging dock on every map. */
export const DOCK_MARKER = 'home';

export function fetchRequest(t: Thing, from: Where, to: Where, finish: Finish): Request {
  return { path: '/tasks/fetch', body: { object: t.object, colour: t.colour, source: from, dest: to, finish }, timeoutMs: 10000 };
}

export function carryRequest(marker: string, then: CarryThen): Request {
  return { path: '/tasks/carry', body: { dest: { marker }, then: then === 'hold' ? null : then, on: null }, timeoutMs: 10000 };
}

export const driveRequest = (dir: DriveDir, m: number, lang: Lang) => stepsRequest([{ do: 'move', dir, m }], lang);

const TURN_DEG: Record<TurnWay, number> = { left: 90, right: -90, around: 180 };
export const turnRequest = (way: TurnWay, lang: Lang) => stepsRequest([{ do: 'turn', deg: TURN_DEG[way] }], lang);

// lumi.py LOOK: +yaw = Lumi's left, +pitch = up; the head rests at its lowest pitch (robot/head.py HEAD_REST_PITCH)
export const HEAD_REST_PITCH = -5;
const LOOK_YAW = 40;
const LOOK_UP_PITCH = 20;

/** /head/turn always takes a yaw: up and down keep the yaw the head has now. */
export function lookRequest(dir: LookDir, headYawDeg: number | null): Request {
  const yaw = headYawDeg ?? 0;
  const body =
    dir === 'left'
      ? { yaw: LOOK_YAW }
      : dir === 'right'
        ? { yaw: -LOOK_YAW }
        : dir === 'centre'
          ? { yaw: 0, pitch: HEAD_REST_PITCH }
          : { yaw, pitch: dir === 'up' ? LOOK_UP_PITCH : HEAD_REST_PITCH };
  return { path: '/head/turn', body, timeoutMs: 20000 };
}

/** The assistant runs and owns the speaker: /say and a spoken /ask are refused then, so it says or answers instead. */
export const assistantTalks = (modes: Modes | null) => !!modes && (modes.greeter || modes.patrol);

export function sayRequest(text: string, modes: Modes | null, lang: Lang): Request {
  return assistantTalks(modes)
    ? stepsRequest([{ do: 'say', text }], lang)
    : { path: '/say', body: { text }, timeoutMs: 60000 };
}

export function askRequest(question: string, modes: Modes | null): Request {
  return assistantTalks(modes) ? commandRequest(question) : { path: '/ask', body: { question, speak: true }, timeoutMs: 90000 };
}

/** The answer /ask gives back (also spoken). */
export function toAnswer(data: unknown): string | null {
  const a = (data as { answer?: unknown } | null)?.answer;
  return typeof a === 'string' && a.trim() ? a.trim() : null;
}

/**
 * A song: with the proposed POST /sing (when GET /songs answers) one by its id, else the words voice takes
 * ("sing a song", "sing Love Attack") through the assistant.
 */
export function singRequest(song: Song | null, singEndpoint: boolean): Request {
  if (singEndpoint) return { path: '/sing', body: { id: song?.id ?? null } };
  return commandRequest(song ? `sing ${song.title}` : 'sing a song');
}

export const volumeRequest = (percent: number): Request => ({ path: '/volume', body: { percent } });

// ---------- when an action can run ----------
/** What an action needs; the robot refuses it otherwise (lumi-wave server.py _switches, robot_free, steps.check). */
export type Need = 'modes' | 'patrol' | 'arm' | 'empty' | 'holding';

export interface Ready {
  modes: Modes | null;
  armOn: boolean;
  /** null: not known. */
  holding: boolean | null;
}

const NEED_TEXT: Record<Need, TextKey> = {
  modes: 'cmdNeedModes',
  patrol: 'cmdNeedPatrol',
  arm: 'cmdNeedArm',
  empty: 'cmdNeedEmpty',
  holding: 'cmdNeedHolding',
};

/** Why an action cannot run now, or null when it can. Only what is known stops it: an unknown hand does not. */
export function blocked(needs: Need[], r: Ready): TextKey | null {
  for (const n of needs) {
    const missing =
      n === 'modes'
        ? !assistantTalks(r.modes)
        : n === 'patrol'
          ? !r.modes?.patrol
          : n === 'arm'
            ? !r.armOn
            : n === 'empty'
              ? r.holding === true
              : r.holding === false;
    if (missing) return NEED_TEXT[n];
  }
  return null;
}

// ---------- a typed command (/tasks/parse) ----------
export type ParsedAction = 'fetch' | 'carry' | 'steps' | 'command' | 'give' | 'place';
const ACTIONS: ParsedAction[] = ['fetch', 'carry', 'steps', 'command', 'give', 'place'];

export interface Parsed {
  action: ParsedAction | null;
  /** How Lumi reads it, in English (empty when it has nothing to say). */
  sentence: string;
  problems: string[];
  steps: Record<string, unknown>[];
  /** What voice would only answer (a question, a song): the assistant answers it. */
  talk: string | null;
  /** It drives or turns the base or the waist. */
  base: boolean;
  raw: Record<string, unknown>;
}

const objectOf = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function toParsed(raw: unknown): Parsed {
  const r = objectOf(raw);
  const action = ACTIONS.find((a) => a === r.action) ?? null;
  const sentence = typeof r.sentence === 'string' ? r.sentence.trim() : '';
  return {
    action,
    sentence: /^[\s\-–—.]*$/.test(sentence) ? '' : sentence, // the robot writes "–" for nothing
    problems: Array.isArray(r.problems) ? r.problems.filter((p): p is string => typeof p === 'string') : [],
    steps: Array.isArray(r.steps) ? r.steps.map(objectOf) : [],
    talk: typeof r.talk === 'string' ? r.talk : null,
    base: r.base === true,
    raw: r,
  };
}

/** What Start sends for a typed command, as the dashboard's Command dialog does; null when nothing can start. */
export function parsedStart(p: Parsed, uiLang: Lang): Request | null {
  if (!p.action || p.problems.length) return null;
  const task = objectOf(p.raw.task);
  switch (p.action) {
    case 'give':
      return giveRequest;
    case 'place':
      return { path: '/tasks/place', body: { on: task.on ?? null } };
    case 'carry':
      return { path: '/tasks/carry', body: { dest: task.dest, then: task.then ?? null, on: task.on ?? null }, timeoutMs: 10000 };
    case 'steps':
      return {
        path: '/tasks/steps',
        body: { steps: p.steps, lang: p.raw.lang === 'ko' || p.raw.lang === 'en' ? p.raw.lang : uiLang, sender: p.raw.sender ?? null },
        timeoutMs: 10000,
      };
    case 'command':
      return typeof p.raw.text === 'string' ? commandRequest(p.raw.text) : null;
    case 'fetch':
      return { path: '/tasks/fetch', body: task, timeoutMs: 10000 };
  }
}

/** Starting it moves the arm or the base, so it is asked first. Answers, songs and "stop" are not. */
export function parsedMoves(p: Parsed): boolean {
  if (p.action !== 'command') return p.action !== null;
  if (p.sentence === 'Stop.') return false;
  return p.base || p.talk === null;
}

// ---------- a mission's steps in both languages ----------
export interface StepLine {
  key: TextKey;
  /** Shown as they are (markers, numbers, the words to say). */
  vars: Record<string, string | number>;
  /** Translated before they are put in. */
  keys: Record<string, TextKey>;
}

const DIR_TEXT: Record<string, TextKey> = { forward: 'cmdDirForward', back: 'cmdDirBack', left: 'cmdDirLeft', right: 'cmdDirRight' };
const ARM_STEP_TEXT: Record<string, TextKey> = { reach: 'cmdArmReach', fold: 'cmdArmFold', open: 'cmdArmOpen', close: 'cmdArmClose', bag: 'cmdArmBag' };

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** One line per step of a mission (docs/17 §1); a step added later shows its name. */
export function stepLine(s: Record<string, unknown>): StepLine {
  const line = (key: TextKey, vars: StepLine['vars'] = {}, keys: StepLine['keys'] = {}): StepLine => ({ key, vars, keys });
  const objectKeys = (): StepLine['keys'] => (isObject(s.object) ? { object: OBJECT_TEXT[s.object] } : {});
  const objectVars = (): StepLine['vars'] => (isObject(s.object) ? {} : { object: str(s.object) });
  switch (s.do) {
    case 'go':
      if (Array.isArray(s.to)) return line('cmdStepGoOneOf', { to: s.to.map(str).join(', ') });
      return s.to === 'here' ? line('cmdStepGoBack') : line('cmdStepGo', { to: str(s.to) });
    case 'move':
      return line('cmdStepMove', { m: str(s.m) }, DIR_TEXT[str(s.dir)] ? { dir: DIR_TEXT[str(s.dir)] } : {});
    case 'turn': {
      const deg = typeof s.deg === 'number' ? s.deg : 0;
      return line(deg >= 0 ? 'cmdStepTurnLeft' : 'cmdStepTurnRight', { deg: Math.abs(deg) });
    }
    case 'pick': {
      const colour: StepLine['keys'] = isColour(s.colour) ? { colour: COLOUR_TEXT[s.colour] } : {};
      return line(isColour(s.colour) ? 'cmdStepPickColour' : 'cmdStepPick', objectVars(), { ...objectKeys(), ...colour });
    }
    case 'receive':
      return typeof s.wait_s === 'number'
        ? line('cmdStepReceiveWait', { ...objectVars(), s: Math.round(s.wait_s) }, objectKeys())
        : line('cmdStepReceive', objectVars(), objectKeys());
    case 'say':
      return line('cmdStepSay', { text: str(s.text) });
    case 'place':
      return line('cmdStepPlace');
    case 'give':
      return line('cmdStepGive');
    case 'hold':
      return line('cmdStepHold');
    case 'wait':
      if (s.until) return line('cmdStepWaitOrder');
      return typeof s.s === 'number' ? line('cmdStepWait', { s: Math.round(s.s) }) : line('cmdStepStay');
    case 'arm':
      return ARM_STEP_TEXT[str(s.pose)] ? line(ARM_STEP_TEXT[str(s.pose)]) : line('cmdStepOther', { name: `arm ${str(s.pose)}` });
    default:
      return line('cmdStepOther', { name: str(s.do) });
  }
}

/** A step line as text, in the language `tr` gives. */
export function stepText(l: StepLine, tr: (k: TextKey) => string): string {
  const keyed = Object.fromEntries(Object.entries(l.keys).map(([k, v]) => [k, tr(v)]));
  return fill(tr(l.key), { ...l.vars, ...keyed });
}

// ---------- how a tap went ----------
export type Phase = 'sending' | 'sent' | 'assistant' | 'done' | 'refused' | 'lost';

export interface Outcome {
  phase: Phase;
  /** The robot's reason for a refusal. */
  reason: string | null;
  /** /ask gives the answer back. */
  answer: string | null;
}

/** `waits`: the endpoint answers when the action has ended (a wave, a pose, the gripper, speech, the head). */
export function toOutcome(reply: Reply, waits: boolean): Outcome {
  if (!reply.ok) return { phase: reply.status === 0 ? 'lost' : 'refused', reason: reply.reason, answer: null };
  const by = (reply.data as { by?: unknown } | null)?.by;
  return { phase: by === 'assistant' ? 'assistant' : waits ? 'done' : 'sent', reason: null, answer: toAnswer(reply.data) };
}
