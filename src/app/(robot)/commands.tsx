// The Commands screen (docs/COMMANDS.md): everything Lumi can do, each a tap or a tap and a small choice, grouped as
// Arm & objects, Moving, Talking and Missions; Arm setup has the arm by hand instead (ui/ArmSetupPanel). Anything
// that moves the arm or the base asks first. The line under the groups says how the last tap in that group went
// (sent, refused and why; "Done" for DONE_SHOWN_MS, then it goes), and what Lumi is doing; the task card on the right has Pause, Release and Stop as on every screen. Missions
// has the typed command box: read as voice reads it first.
// The content sits between the modes on the left, the task card on the right, the power chips on top and the Dock.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSteadyWindow } from '../../lib/steadyWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { bodyPoseKnown, stepText as taskStepText, taskButtons, type TaskCommand } from '../../lib/api';
import {
  askRequest,
  asideRequest,
  blocked,
  carryRequest,
  comeRequest,
  DOCK_MARKER,
  fetchRequest,
  fill,
  followRequest,
  giveRequest,
  goRequest,
  lookStep,
  headPoseOf,
  type LookEdge,
  parsedMoves,
  parsedStart,
  pickRequest,
  placeRequest,
  read,
  reasonKey,
  receiveRequest,
  sayRequest,
  send,
  singRequest,
  thingChoices,
  seenThings,
  parseThing,
  REACH_MM,
  thingId,
  thingText,
  toHolding,
  toMarkers,
  toOutcome,
  toSkillState,
  toSongs,
  turnRequest,
  waveRequest,
  type CarryThen,
  type Finish,
  type LookDir,
  type Need,
  type Outcome,
  type Parsed,
  type Request,
  type SkillState,
  type Song,
  type Thing,
  type TurnWay,
  type Where,
} from '../../lib/commands';
import { textOf, useI18n, type TextKey } from '../../lib/i18n';
import { validPoseName } from '../../lib/arm';
import { useRobot } from '../../lib/robot';
import { ArmSetupPanel, type ArmReport, type NameRequest } from '../../ui/ArmSetupPanel';
import { CommandIcon, type CommandIconName } from '../../ui/CommandIcon';
import { Joystick, joystickSize } from '../../ui/Joystick';
import { VolumeButton } from '../../ui/VolumeButton';
import { ChoiceDialog, LookPad, TurnPad, CommandBox, TextDialog, type Box, type ChoiceField } from '../../ui/CommandDialogs';
import { ConfirmDialog, type ConfirmRequest } from '../../ui/ConfirmDialog';
import { NameDialog } from '../../ui/NameDialog';
import { usePowerSwitch } from '../../ui/usePowerSwitch';
import { clamp, colors, fonts, mono } from '../../ui/theme';

const POLL_MS = 1500; // the hand and the last skill, while this screen is open
const DOCK_SPACE = 64; // room the sections dock takes at the bottom, above the safe area
const SEEN_WAIT_MS = 3000; // the torso camera's objects when a choice of objects opens
const SEEN_POLL_MS = 1000; // Pick up and Move aside: the things seen, read again this often while the list is open
const MARKERS_POLL_MS = 3000; // a choice of markers: the map's markers, read again this often while it is open
const DONE_SHOWN_MS = 4000; // a finished tap's "Done" stays this long, then the line shows the task again

type Group = 'arm' | 'mission' | 'armSetup';
const GROUPS: { key: Group; label: TextKey }[] = [
  { key: 'arm', label: 'cmdGroupArm' },
  { key: 'mission', label: 'cmdGroupMission' },
  { key: 'armSetup', label: 'cmdGroupArmSetup' },
];

type ChoiceKind = 'pick' | 'receive' | 'aside' | 'goto' | 'fetch' | 'carry' | 'sing';

/** One tap's request: `ask` is the question before it moves anything; `waits` it answers when done. */
interface Run {
  label: TextKey;
  req: Request;
  ask?: string;
  waits?: boolean;
  /** A skill: /skills/state tells how it goes. */
  skill?: boolean;
}

interface Last extends Outcome {
  label: TextKey;
  at: number;
  skill: boolean;
  /** A reason the app knew before sending (blocked). */
  key: TextKey | null;
  /** When it was first seen finished; `faded` once DONE_SHOWN_MS later (the line then shows the task, an answer stays). */
  doneAt?: number;
  faded?: boolean;
  /** When the robot answered the tap: a skill's /skills/state read after this is about this skill (it is `running`
   *  before the robot answers). */
  answeredAt?: number;
}

interface Tile {
  icon: CommandIconName;
  label: TextKey;
  hint?: TextKey;
  needs?: Need[];
  /** Why it can not run now, worked out here (the task buttons). */
  off?: TextKey | null;
  onPress: () => void;
  wide?: boolean;
  red?: boolean;
}

const TASK_TILES: { cmd: TaskCommand; icon: CommandIconName; label: TextKey }[] = [
  { cmd: 'pause', icon: 'pause', label: 'pause' },
  { cmd: 'resume', icon: 'resume', label: 'resume' },
  { cmd: 'release', icon: 'release', label: 'release' },
  { cmd: 'stop', icon: 'stop', label: 'stopTask' },
];

/** ARM & OBJECTS' last row, centred. */
const PAIR: TextKey[] = ['cmdAsk', 'cmdSay'];
const EXAMPLES: TextKey[] = ['cmdEx1', 'cmdEx2', 'cmdEx3', 'cmdEx4'];
const TURNS: { id: TurnWay; label: TextKey; ask: TextKey }[] = [
  { id: 'left', label: 'cmdTurnLeft', ask: 'cmdAskTurnLeft' },
  { id: 'right', label: 'cmdTurnRight', ask: 'cmdAskTurnRight' },
  { id: 'around', label: 'cmdTurnAround', ask: 'cmdAskTurnAround' },
];
const REACHED: Record<LookEdge, TextKey> = {
  top: 'cmdReachedTop',
  bottom: 'cmdReachedBottom',
  left: 'cmdReachedLeft',
  right: 'cmdReachedRight',
};
const CHOICE_TITLE: Record<ChoiceKind, TextKey> = {
  pick: 'cmdPick',
  receive: 'cmdReceive',
  aside: 'cmdAside',
  goto: 'cmdGoTo',
  fetch: 'cmdFetch',
  carry: 'cmdCarry',
  sing: 'cmdSing',
};
const SKILL_TEXT: Record<SkillState['status'], TextKey> = {
  idle: 'cmdSent',
  running: 'cmdSkillRunning',
  done: 'cmdDone',
  refused: 'cmdRefused',
  stopped: 'cmdSkillStopped',
  failed: 'cmdSkillFailed',
};

export default function CommandsScreen() {
  const { t, lang } = useI18n();
  const { connection, status, task, modes } = useRobot();
  const url = connection.baseUrl;
  const { width: w, height: h } = useSteadyWindow();
  const inset = useSafeAreaInsets();
  const focused = useIsFocused();

  const [group, setGroup] = useState<Group>('arm');
  const [markers, setMarkers] = useState<string[]>([]);
  /** null: the robot has no GET /songs (yet); songs are then asked for by words. */
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [holding, setHolding] = useState<boolean | null>(null);
  const [skill, setSkill] = useState<(SkillState & { readAt: number }) | null>(null);
  const [things, setThings] = useState<Thing[]>(() => thingChoices(null, REACH_MM.arm));
  /** Pick up and Move aside: the things the torso camera sees near now; null until the first reading. */
  const [seen, setSeen] = useState<Thing[] | null>(null);
  /** Each group's own last tap: a group never shows another group's result. */
  const [lasts, setLasts] = useState<Partial<Record<Group, Last>>>({});
  const last = lasts[group] ?? null;
  const put = useCallback((g: Group, next: Last | ((prev: Last | undefined) => Last | undefined)) => {
    setLasts((prev) => ({ ...prev, [g]: typeof next === 'function' ? next(prev[g]) : next }));
  }, []);
  const [choice, setChoice] = useState<ChoiceKind | null>(null);
  const [looking, setLooking] = useState(false); // LOOK's direction pad
  const [turning, setTurning] = useState(false); // TURN's pad
  /** The head's pose from the last /head/turn answer: quick taps step on from there, not from the 1 s status. */
  const headPose = useRef<{ yaw: number; pitch: number } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [text, setText] = useState<'say' | 'ask' | 'pick' | null>(null);
  const [naming, setNaming] = useState<NameRequest | null>(null); // ARM SETUP's pose name
  const power = usePowerSwitch(); // ARM SETUP's arm chip

  // what the choices offer, read each time the screen opens; the hand and the skill while it is open
  useEffect(() => {
    if (!focused) return;
    let on = true;
    read(url, '/agv/markers').then((r) => on && setMarkers(toMarkers(r)));
    read(url, '/songs').then((r) => on && setSongs(r === null ? null : toSongs(r)));
    const tick = () => {
      const readAt = Date.now();
      read(url, '/tasks/state', 3000).then((r) => on && r !== null && setHolding(toHolding(r)));
      read(url, '/skills/state', 3000).then((r) => {
        const s = toSkillState(r);
        if (!on || !s) return;
        setSkill({ ...s, readAt });
        if (s.status !== 'done') return;
        // a skill sent before this reading has finished: its line fades from now on
        setLasts((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const g of Object.keys(prev) as Group[]) {
            const l = prev[g];
            if (l && l.skill && l.phase === 'sent' && l.answeredAt !== undefined && l.answeredAt < readAt && l.doneAt === undefined) {
              next[g] = { ...l, doneAt: Date.now() };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      });
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [focused, url]);

  // the map's markers again while a choice of markers is open: a marker just added, or a new map, shows at once
  const markersOpen = choice === 'goto' || choice === 'fetch' || choice === 'carry';
  useEffect(() => {
    if (!markersOpen) return;
    let on = true;
    const tick = () => read(url, '/agv/markers').then((r) => on && r !== null && setMarkers(toMarkers(r)));
    tick();
    const id = setInterval(tick, MARKERS_POLL_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [markersOpen, url]);

  // Pick up and Move aside offer only what the torso camera sees near, read again while the list is open
  const seenOpen = text === 'pick' || choice === 'aside';
  const reach = modes?.patrol ? REACH_MM.drive : REACH_MM.arm;
  useEffect(() => {
    if (!seenOpen) return;
    let on = true;
    const tick = () => read(url, '/objects', SEEN_WAIT_MS).then((r) => on && r !== null && setSeen(seenThings(r, reach)));
    tick();
    const id = setInterval(tick, SEEN_POLL_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [seenOpen, url, reach]);

  const ready = { modes, armOn: status?.armState === 'enabled', holding };
  const body = status?.body ?? null;

  // ---------- sending ----------
  const fire = useCallback(
    (r: Run) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const at = Date.now();
      const g = group; // the answer goes to the group it was sent from, even if another one is open by then
      put(g, { label: r.label, at, skill: !!r.skill, key: null, phase: 'sending', reason: null, answer: null });
      return send(url, r.req).then((reply) => {
        const out = toOutcome(reply, !!r.waits);
        const answeredAt = Date.now();
        const doneAt = out.phase === 'done' ? answeredAt : undefined;
        // a newer tap's line stays
        put(g, (prev) => (prev && prev.at !== at ? prev : { label: r.label, at, skill: !!r.skill, key: null, ...out, doneAt, answeredAt }));
        return reply;
      });
    },
    [url, put, group],
  );

  /** LOOK's tap: a step from where the head is; the words to show in the pad when it is at an end (or got there). */
  const lookAt = async (dir: LookDir): Promise<string | null> => {
    const known = bodyPoseKnown(body) ? { yaw: body.headYawDeg, pitch: body.headPitchDeg } : null;
    const pose = headPose.current ?? known;
    const step = lookStep(dir, pose?.yaw ?? null, pose?.pitch ?? null);
    if ('reached' in step) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return t(REACHED[step.reached]);
    }
    const reply = await fire({ label: 'cmdLook', req: step.req, waits: true });
    if (!reply.ok) return null; // the status line says why
    headPose.current = headPoseOf(reply.data) ?? headPose.current;
    return step.edge ? t(REACHED[step.edge]) : null;
  };
  /** TURN's tap: asked first, as every move of the base. */
  const turnTo = (way: TurnWay) => {
    const x = TURNS.find((w) => w.id === way);
    if (x) go({ label: 'cmdTurn', req: turnRequest(way, lang), ask: t(x.ask) });
  };

  const go = (r: Run) => {
    if (!r.ask) return fire(r);
    setConfirm({ title: r.ask, choices: [{ text: t('cmdGo'), onPress: () => fire(r) }] });
  };

  /** A tile's tap: what it needs first, else its run. */
  const refuse = useCallback((label: TextKey, why: TextKey) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    put(group, { label, at: Date.now(), skill: false, key: why, phase: 'refused', reason: null, answer: null });
  }, [put, group]);
  /** ARM SETUP's taps, on the same status line. */
  const report = useCallback((r: ArmReport) => {
    const at = Date.now();
    put('armSetup', { label: r.label, at, skill: false, key: r.key ?? null, phase: r.phase, reason: r.reason ?? null, answer: null, doneAt: r.phase === 'done' ? at : undefined });
  }, [put]);

  // a finished tap's line fades DONE_SHOWN_MS after it finished
  useEffect(() => {
    const timers = (Object.keys(lasts) as Group[]).flatMap((g) => {
      const l = lasts[g];
      if (!l || l.doneAt === undefined || l.faded) return [];
      const at = l.at;
      const fade = () => put(g, (prev) => (prev && prev.at === at ? { ...prev, faded: true } : prev));
      return [setTimeout(fade, Math.max(0, l.doneAt + DONE_SHOWN_MS - Date.now()))];
    });
    return () => timers.forEach(clearTimeout);
  }, [lasts, put]);
  const tap = (tile: Tile) => {
    const why = tile.off ?? blocked(tile.needs ?? [], ready);
    if (why) refuse(tile.label, why);
    else tile.onPress();
  };

  // ---------- choices ----------
  const open = (kind: ChoiceKind, first: Record<string, string>) => {
    Haptics.selectionAsync().catch(() => {});
    setValues(first);
    setChoice(kind);
  };
  const openPick = () => {
    setSeen(null);
    setText('pick');
  };
  const openSeen = (kind: 'pick' | 'aside') => {
    setSeen(null);
    open(kind, {});
  };
  /** A tap on a thing seen: it starts at once (the owner: no GO, no second question). */
  const pickSeen = (id: string) => {
    const kind = choice;
    const thing = (seen ?? []).find((x) => thingId(x) === id);
    setChoice(null);
    if (!thing) return;
    if (kind === 'pick') fire({ label: 'cmdPick', req: pickRequest(thing, lang) });
    if (kind === 'aside') fire({ label: 'cmdAside', req: asideRequest(thing), skill: true });
  };
  const seenField: ChoiceField = {
    key: 'thing',
    title: 'cmdChooseObject',
    empty: seen === null ? 'cmdLookingNear' : 'cmdNothingNear',
    options: (seen ?? []).map((x) => ({ id: thingId(x), label: thingText(x, t) })),
  };

  const openThings = (kind: ChoiceKind) => {
    const known = thingChoices(null, reach);
    setThings(known);
    open(kind, { thing: thingId(known[0]) });
    read(url, '/objects', SEEN_WAIT_MS).then((r) => {
      if (r === null) return;
      const seen = thingChoices(r, reach);
      setThings(seen);
      // the first offered thing seen is the first choice, unless one was picked meanwhile
      const first = seen.find((x) => x.seen) ?? seen[0];
      setValues((v) => (v.thing === thingId(known[0]) ? { ...v, thing: thingId(first) } : v));
    });
  };

  const thingField: ChoiceField = {
    key: 'thing',
    title: 'cmdChooseObject',
    fit: true,
    options: things.map((x) => ({ id: thingId(x), label: thingText(x, t), note: x.seen ? t('cmdSeen') : undefined })),
  };
  /** A choice of where: one dropdown (Here first when it may be here, then every marker on the map in name order,
   *  the charger a marker like the others). FETCH, GO TO and CARRY alike (owner, 2026-11-24: the grid with its own
   *  Charger row was long and hard to read). */
  const placeField = (key: string, title: TextKey, here: boolean): ChoiceField => ({
    key,
    title,
    empty: 'cmdNoMarkers',
    dropdown: true,
    options: [
      ...(here ? [{ id: 'here', label: t('cmdHere'), icon: 'come' as const }] : []),
      ...[...markers]
        .sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }))
        .map((m) => ({ id: m, label: m })),
    ],
  });

  const fields = (kind: ChoiceKind): ChoiceField[] => {
    switch (kind) {
      case 'pick':
      case 'aside':
        return [seenField];
      case 'receive':
        return [thingField];
      case 'goto':
        return [placeField('marker', 'cmdChooseMarker', false)];
      case 'fetch':
        // objects in one row, From and To as dropdowns side by side, the charger a marker like the others (owner,
        // 2026-11-24: the marker grids twice made it long and hard to read)
        return [
          thingField,
          placeField('from', 'cmdChooseFrom', true),
          placeField('to', 'cmdChooseTo', true),
          {
            key: 'finish',
            title: 'cmdChooseFinish',
            options: [
              { id: 'hold', label: t('cmdFinishHold') },
              { id: 'place', label: t('cmdFinishPlace') },
            ],
          },
        ];
      case 'carry':
        return [
          placeField('to', 'cmdChooseTo', false),
          {
            key: 'then',
            title: 'cmdChooseThen',
            options: [
              { id: 'hold', label: t('cmdFinishHold') },
              { id: 'place', label: t('cmdFinishPlace') },
              { id: 'give', label: t('cmdThenGive') },
            ],
          },
        ];
      case 'sing':
        return [
          {
            key: 'song',
            title: 'cmdChooseSong',
            options: [{ id: 'any', label: t('cmdAnySong') }, ...(songs ?? []).map((s) => ({ id: s.id, label: lang === 'ko' ? s.titleKo : s.title }))],
          },
        ];
    }
  };

  /** What the choice dialog's GO starts. */
  const runFor = (kind: ChoiceKind, v: Record<string, string>): Run | null => {
    const thing = things.find((x) => thingId(x) === v.thing);
    const where = (id: string): Where => (id === 'here' ? 'here' : { marker: id });
    const said = (id: string) => (id === 'here' ? t('cmdHereSaid') : id); // a marker by the name the list shows
    switch (kind) {
      case 'pick':
        return thing ? { label: 'cmdPick', req: pickRequest(thing, lang), ask: fill(t('cmdAskPick'), { thing: thingText(thing, t) }) } : null;
      case 'receive':
        return thing
          ? { label: 'cmdReceive', req: receiveRequest(thing, lang), ask: fill(t('cmdAskReceive'), { thing: thingText(thing, t) }) }
          : null;
      case 'aside':
        return thing
          ? { label: 'cmdAside', req: asideRequest(thing), ask: fill(t('cmdAskAside'), { thing: thingText(thing, t) }), skill: true }
          : null;
      case 'goto':
        return { label: 'cmdGoTo', req: goRequest(v.marker), ask: fill(t('cmdAskGo'), { marker: said(v.marker) }) };
      case 'fetch':
        return thing
          ? {
              label: 'cmdFetch',
              req: fetchRequest(thing, where(v.from), where(v.to), v.finish as Finish),
              ask: fill(t('cmdAskFetch'), { thing: thingText(thing, t), from: said(v.from), to: said(v.to) }),
            }
          : null;
      case 'carry':
        return { label: 'cmdCarry', req: carryRequest(v.to, v.then as CarryThen), ask: fill(t('cmdAskCarry'), { to: said(v.to) }) };
      case 'sing':
        return { label: 'cmdSing', req: singRequest((songs ?? []).find((s) => s.id === v.song) ?? null, songs !== null) };
    }
  };
  const choiceDone = () => {
    const kind = choice;
    setChoice(null);
    const r = kind && runFor(kind, values);
    if (r) go(r);
  };

  // ---------- typed commands ----------
  const startParsed = (p: Parsed) => {
    const req = parsedStart(p, lang);
    if (!req) return;
    // the robot reads it back in English only: in Korean the box above already showed the steps
    const question = lang === 'en' && p.sentence ? p.sentence : t('cmdAskStart');
    const r: Run = { label: 'cmdType', req, ask: parsedMoves(p) ? question : undefined };
    go(r);
  };

  const sendText = (words: string) => {
    const kind = text;
    setText(null);
    if (kind === 'say') fire({ label: 'cmdSay', req: sayRequest(words, modes, lang), waits: true });
    if (kind === 'ask') fire({ label: 'cmdAsk', req: askRequest(words, modes), waits: true });
    if (kind === 'pick') {
      // the owner types what to take; started at once, no second question
      const thing = parseThing(words, (k) => [textOf('en', k), textOf('ko', k)]);
      if (thing) fire({ label: 'cmdPick', req: pickRequest(thing, lang) });
      else refuse('cmdPick', 'cmdPickUnknown');
    }
  };


  // ---------- the tiles ----------
  const firstMarker = markers.find((m) => m !== DOCK_MARKER) ?? markers[0] ?? '';
  const buttons = task ? taskButtons(task) : [];

  const TILES: Record<Exclude<Group, 'armSetup'>, Tile[]> = {
    // the main commands, most used first: Go charge, Wave, Sing, Follow me, Go to; then Look, Turn, Come, Pick up,
    // Fetch; Take, Give, Put it down, Move object, Carry; Ask and Say last, a row of their own in the middle
    // (owner, 2026-11-23 and 2026-11-24; Drive is gone: the joystick drives);
    // with all of MOVING and TALKING (those groups are gone); Volume is the edge button (ui/VolumeButton)
    arm: [
      {
        icon: 'dock',
        label: 'cmdDock',
        hint: 'cmdDockHint',
        onPress: () => go({ label: 'cmdDock', req: goRequest(DOCK_MARKER), ask: t('cmdAskDock') }),
      },
      {
        icon: 'wave',
        label: 'cmdWave',
        hint: 'cmdWaveHint',
        needs: ['arm'],
        onPress: () => go({ label: 'cmdWave', req: waveRequest, ask: t('cmdAskWave'), waits: true }),
      },
      // without the proposed /sing only the assistant sings (Greeter or Patrol on)
      { icon: 'sing', label: 'cmdSing', hint: 'cmdSingHint', needs: songs === null ? ['modes'] : [], onPress: () => open('sing', { song: 'any' }) },
      {
        icon: 'follow',
        label: 'cmdFollow',
        hint: 'cmdFollowHint',
        needs: ['patrol'],
        onPress: () => go({ label: 'cmdFollow', req: followRequest, ask: t('cmdAskFollow') }),
      },
      { icon: 'goto', label: 'cmdGoTo', hint: 'cmdGoToHint', onPress: () => open('goto', { marker: firstMarker }) },
      { icon: 'look', label: 'cmdLook', hint: 'cmdLookHint', onPress: () => setLooking(true) },
      { icon: 'turn', label: 'cmdTurn', hint: 'cmdTurnHint', needs: ['patrol'], onPress: () => setTurning(true) },
      {
        icon: 'come',
        label: 'cmdCome',
        hint: 'cmdComeHint',
        needs: ['patrol'],
        onPress: () => go({ label: 'cmdCome', req: comeRequest, ask: t('cmdAskCome') }),
      },
      { icon: 'pick', label: 'cmdPick', hint: 'cmdPickHint', needs: ['modes', 'arm', 'empty'], onPress: () => openPick() },
      {
        icon: 'fetch',
        label: 'cmdFetch',
        hint: 'cmdFetchHint',
        needs: ['patrol', 'arm', 'empty'],
        onPress: () => {
          openThings('fetch');
          setValues((v) => ({ ...v, from: 'here', to: 'here', finish: 'hold' })); // both start at Here (owner, 2026-11-24)
        },
      },
      { icon: 'receive', label: 'cmdReceive', hint: 'cmdReceiveHint', needs: ['modes', 'arm', 'empty'], onPress: () => openThings('receive') },
      {
        icon: 'give',
        label: 'cmdGive',
        hint: 'cmdGiveHint',
        needs: ['modes', 'arm', 'holding'],
        onPress: () => go({ label: 'cmdGive', req: giveRequest, ask: t('cmdAskGive') }),
      },
      {
        icon: 'place',
        label: 'cmdPlace',
        hint: 'cmdPlaceHint',
        needs: ['modes', 'arm', 'holding'],
        onPress: () => go({ label: 'cmdPlace', req: placeRequest, ask: t('cmdAskPlace') }),
      },
      { icon: 'aside', label: 'cmdAside', hint: 'cmdAsideHint', needs: ['arm', 'empty'], onPress: () => openSeen('aside') },
      {
        icon: 'carry',
        label: 'cmdCarry',
        hint: 'cmdCarryHint',
        needs: ['patrol', 'arm', 'holding'],
        onPress: () => open('carry', { to: firstMarker, then: 'hold' }),
      },
      { icon: 'ask', label: 'cmdAsk', hint: 'cmdAskHint', onPress: () => setText('ask') },
      { icon: 'say', label: 'cmdSay', hint: 'cmdSayHint', onPress: () => setText('say') },
    ],
    mission: [
      ...TASK_TILES.map(
        (x): Tile => ({
          icon: x.icon,
          label: x.label,
          off: buttons.includes(x.cmd) ? null : 'cmdNoTask',
          red: x.cmd === 'stop',
          onPress: () => fire({ label: x.label, req: { path: `/tasks/${x.cmd}` } }),
        }),
      ),
    ],
  };

  // ---------- layout ----------
  const size = clamp(13, 0.024 * h, 17);
  const modesText = clamp(13, 0.024 * h, 18); // ModesPanel's sizes: its switches stay clear
  const switchW = clamp(36, 0.06 * h, 46);
  const left = 26 + inset.left + 16 + 10 + modesText * 1.6 + modesText * 6.4 + switchW + 16;
  // the joystick bottom right (owner, 2026-11-23) keeps the tiles clear of it, as the readings or the task card do
  // the task card's room is kept free whether a task runs or not, so the tiles do not jump when one starts or ends
  // (owner, 2026-11-23, seen on TALK)
  const right = 24 + inset.right + Math.max(clamp(220, 0.42 * h, 340) + 12, joystickSize(h) + 16);
  const top = 14 + inset.top + Math.max(44, 0.075 * h);
  const bottom = 18 + inset.bottom + DOCK_SPACE;
  const area: Box = { left, right, top, bottom };
  const inner = Math.max(200, w - left - right);
  const gap = size * 0.6;
  // tiles from 6.8 text sizes wide: five in a row on the tablet beside the joystick too (owner, 2026-11-23; a
  // 1024 x 600 tablet leaves about 600 px between the modes and the joystick)
  const cols = clamp(2, Math.floor((inner + gap) / (size * 6.8 + gap)), 5);
  // whole pixels with one to spare per tile: an exact fraction rounds up on a tablet and the last tile of a row
  // drops to the next one (owner, 2026-11-23: four in a row where five fit)
  const fit = (n: number) => Math.floor((inner - gap * (n - 1)) / n) - 1;
  const tileW = fit(cols);
  const taskW = fit(TASK_TILES.length);
  // Ask and Say a row of their own in the middle, as wide together as the three middle tiles above (owner, 2026-11-24)
  const pairSpan = Math.max(2, cols - 2);
  const pairW = Math.floor((pairSpan * tileW + (pairSpan - 2) * gap) / 2);

  const statusLine = (): { dot: string; head: string; words: string } => {
    if (group === 'armSetup' && power.note) return { dot: mono.yellow, head: t('cmdGroupArmSetup'), words: t(power.note) };
    if (!last || last.faded) {
      if (!task) return { dot: mono.dim, head: t('cmdTask'), words: t('cmdNoTask') };
      const k = taskStepText(task.step);
      return { dot: mono.green, head: t('cmdTask'), words: k ? t(k) : task.step };
    }
    const head = t(last.label);
    if (last.key) return { dot: last.phase === 'done' ? mono.green : last.phase === 'lost' ? mono.red : mono.yellow, head, words: t(last.key) };
    const said = (r: string | null) => {
      const k = reasonKey(r);
      return k ? t(k) : r ?? t('cmdRefused');
    };
    if (last.skill && last.phase === 'sent' && skill && skill.readAt > (last.answeredAt ?? last.at) && skill.status !== 'idle') {
      const bad = skill.status === 'refused' || skill.status === 'stopped' || skill.status === 'failed';
      return {
        dot: skill.status === 'running' ? mono.blue : bad ? mono.yellow : mono.green,
        head,
        words: bad && skill.reason ? said(skill.reason) : t(SKILL_TEXT[skill.status]),
      };
    }
    switch (last.phase) {
      case 'sending':
        return { dot: mono.soft, head, words: t('cmdSending') };
      case 'sent':
        return { dot: mono.green, head, words: t('cmdSent') };
      case 'assistant':
        return { dot: mono.green, head, words: t('cmdSentAssistant') };
      case 'done':
        return { dot: mono.green, head, words: t('cmdDone') };
      case 'refused':
        return { dot: mono.yellow, head, words: said(last.reason) };
      case 'lost':
        return { dot: mono.red, head, words: t('noAnswer') };
    }
  };
  const line = statusLine();

  const renderTile = (tile: Tile, width?: number) => {
    const why = tile.off ?? blocked(tile.needs ?? [], ready);
    // MISSIONS' task buttons: one row filling the width, icon beside the word
    const row = group === 'mission';
    return (
      <Pressable
        key={tile.label}
        onPress={() => tap(tile)}
        accessibilityRole="button"
        accessibilityLabel={t(tile.label)}
        accessibilityHint={why ? t(why) : tile.hint && t(tile.hint)}
        style={({ pressed }) => [
          styles.tile,
          row
            ? [styles.tileRow, { width: taskW, minHeight: size * 3.4, padding: size * 0.7, gap: size * 0.6 }]
            : { width: width ?? (tile.wide ? inner : tileW), minHeight: size * 5.6, padding: size * 0.8, gap: size * 0.35 },
          tile.red && styles.tileRed,
          !!why && (row ? styles.tileRowOff : styles.tileOff),
          pressed && styles.pressed,
        ]}
      >
        <CommandIcon name={tile.icon} size={size * (row ? 1.3 : 1.7)} color={tile.red && !why ? mono.red : mono.text} />
        <Text style={[styles.tileLabel, { fontSize: size * 0.92 }, tile.red && !why && styles.tileLabelRed]} numberOfLines={row ? 1 : 2}>
          {t(tile.label)}
        </Text>
        {tile.hint && (
          <Text style={[styles.tileHint, { fontSize: size * 0.72 }]} numberOfLines={2}>
            {t(tile.hint)}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.area, { left, right, top, bottom, gap: size * 0.7 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupsScroll} contentContainerStyle={styles.groups}>
          {GROUPS.map((g) => {
            const on = g.key === group;
            return (
              <Pressable
                key={g.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setGroup(g.key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.group,
                  { paddingHorizontal: size * 0.9, paddingVertical: size * 0.5, gap: size * 0.4 },
                  on && styles.groupOn,
                  pressed && styles.pressed,
                ]}
              >
                {on && <View style={[styles.dot, { width: size * 0.45, height: size * 0.45 }]} />}
                <Text style={[styles.groupText, { fontSize: size * 0.85 }, on && styles.groupTextOn]}>{t(g.label)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.status, { gap: size * 0.5, paddingHorizontal: size * 0.8, paddingVertical: size * 0.45 }]} accessibilityLiveRegion="polite">
          <View style={[styles.statusDot, { width: size * 0.55, height: size * 0.55, backgroundColor: line.dot }]} />
          <Text style={[styles.statusHead, { fontSize: size * 0.8 }]}>{line.head}</Text>
          {line.words !== '' && (
            <Text style={[styles.statusWords, { fontSize: size * 0.85 }]} numberOfLines={2}>
              {line.words}
            </Text>
          )}
        </View>
        {last?.answer && (
          <Text style={[styles.answer, { fontSize: size * 0.85 }]} numberOfLines={3}>
            {fill(t('cmdLumiSays'), { answer: last.answer })}
          </Text>
        )}

        {group === 'armSetup' ? (
          <ArmSetupPanel size={size} width={inner} power={power} onReport={report} onAsk={setConfirm} onName={setNaming} />
        ) : (
          <ScrollView style={styles.tilesScroll} contentContainerStyle={[styles.tiles, { gap }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {group === 'mission' && (
              <View style={{ width: inner }}>
                <CommandBox size={size} baseUrl={url} examples={EXAMPLES} onStart={startParsed} />
              </View>
            )}
            {TILES[group].filter((tile) => !PAIR.includes(tile.label)).map((tile) => renderTile(tile))}
            {group === 'arm' && (
              <View style={[styles.pairRow, { width: inner, gap }]}>
                {TILES.arm.filter((tile) => PAIR.includes(tile.label)).map((tile) => renderTile(tile, pairW))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <Joystick />
      <VolumeButton active={focused} />
      {looking && (
        <LookPad
          size={size}
          onLook={lookAt}
          onClose={() => {
            setLooking(false);
            headPose.current = null;
          }}
        />
      )}
      {turning && <TurnPad size={size} onTurn={turnTo} onClose={() => setTurning(false)} />}
      {choice && (
        <ChoiceDialog
          size={size}
          title={t(CHOICE_TITLE[choice])}
          fields={fields(choice)}
          values={values}
          onChange={(k, id) => setValues((v) => ({ ...v, [k]: id }))}
          onDone={choiceDone}
          onClose={() => setChoice(null)}
          onPick={choice === 'pick' || choice === 'aside' ? (_k, id) => pickSeen(id) : undefined}
        />
      )}
      {text && (
        <TextDialog
          box={area}
          size={size}
          title={text === 'say' ? 'cmdSayTitle' : text === 'ask' ? 'cmdAskTitle' : 'cmdPick'}
          placeholder={text === 'say' ? 'cmdSayPlaceholder' : text === 'ask' ? 'cmdAskPlaceholder' : 'cmdPickPlaceholder'}
          hint={text === 'pick' ? t(seen === null ? 'cmdLookingNear' : seen.length ? 'cmdSeenNear' : 'cmdNothingNear') : undefined}
          suggestions={text === 'pick' ? (seen ?? []).map((x) => thingText(x, t)) : undefined}
          onSend={sendText}
          onClose={() => setText(null)}
        />
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <ConfirmDialog request={power.ask} onClose={power.closeAsk} />
      <NameDialog
        open={!!naming}
        title="armSaveTitle"
        rule="armPoseNameRule"
        initial={naming?.initial ?? ''}
        valid={validPoseName}
        onDone={(name) => {
          setNaming(null);
          naming?.onDone(name);
        }}
        onClose={() => setNaming(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  area: { position: 'absolute' },
  groupsScroll: { flexGrow: 0 },
  groups: { gap: 4, padding: 4, borderRadius: 999, backgroundColor: 'rgba(8,8,8,0.92)', borderWidth: 1, borderColor: '#333' },
  group: { flexDirection: 'row', alignItems: 'center', borderRadius: 999 },
  groupOn: { backgroundColor: 'rgba(255,255,255,0.09)' },
  groupText: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1.2, textTransform: 'uppercase' },
  groupTextOn: { fontFamily: fonts.monoBold, color: mono.text },
  dot: { borderRadius: 99, backgroundColor: mono.red },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  statusDot: { borderRadius: 99 },
  statusHead: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1.2, textTransform: 'uppercase' },
  statusWords: { fontFamily: fonts.mono, color: mono.soft, flexShrink: 1 },
  answer: { fontFamily: fonts.mono, color: mono.text, paddingHorizontal: 4 },
  tilesScroll: { flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 8 },
  pairRow: { flexDirection: 'row', justifyContent: 'center' },
  tile: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#0e0f11',
  },
  tileRed: { borderColor: 'rgba(255,45,45,0.55)' },
  tileOff: { opacity: 0.38 },
  tileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderColor: '#4a4a4a' },
  tileRowOff: { opacity: 0.8 },
  tileLabelRed: { color: mono.red },
  tileLabel: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1, textTransform: 'uppercase' },
  tileHint: { fontFamily: fonts.mono, color: mono.soft },
  pressed: { opacity: 0.6 },
});
