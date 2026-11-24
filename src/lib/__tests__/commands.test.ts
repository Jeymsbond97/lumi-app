import type { Modes } from '../api';
import {
  askRequest,
  blocked,
  carryRequest,
  fetchRequest,
  fill,
  lookStep,
  headPoseOf,
  parsedMoves,
  parsedStart,
  pickRequest,
  reasonKey,
  reasonOf,
  sayRequest,
  singRequest,
  stepLine,
  stepText,
  stepVolume,
  thingChoices,
  thingText,
  toMarkers,
  toOutcome,
  toParsed,
  toSkillState,
  toSongs,
  turnRequest,
  seenThings,
  REACH_MM,
  parseThing,
} from '../commands';
import { textOf } from '../i18n';

// i18n stores the language; the mock stands in for the native module (jest.mock needs require here)
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const off: Modes = { greeter: false, patrol: false, wave_greet: false, welcome: false };
const greeter: Modes = { ...off, greeter: true };
const patrol: Modes = { ...off, patrol: true };

describe('reasonOf', () => {
  it('reads FastAPI refusals, a text or a list of field errors', () => {
    expect(reasonOf({ detail: 'Switch on Greeter or Patrol first.' })).toBe('Switch on Greeter or Patrol first.');
    expect(reasonOf({ detail: [{ msg: 'field required' }, { msg: 'bad value' }] })).toBe('field required; bad value');
    expect(reasonOf({ ok: true })).toBeNull();
    expect(reasonOf(null)).toBeNull();
  });

  it('names the refusals people meet most in both languages', () => {
    expect(reasonKey('Switch on Greeter or Patrol first.')).toBe('cmdNeedModes');
    expect(reasonKey("I can't drive or turn my waist right now. Switch on Patrol for that.")).toBe('cmdNeedPatrol');
    expect(reasonKey("That would bring my hand too close to my head, so I won't move my arm.")).toBe('armNearHead');
    expect(reasonKey("I can't move my arm there safely.")).toBe('armBlocked');
    expect(reasonKey('Busy with a task. Pause or stop it first.')).toBe('busy');
    expect(reasonKey('The cup is too far')).toBeNull();
  });
});

describe('fill', () => {
  it('puts values in and leaves unknown names', () => {
    expect(fill('Drive {m} m {dir}?', { m: 0.5, dir: 'forward' })).toBe('Drive 0.5 m forward?');
    expect(fill('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});

describe('thingChoices', () => {
  const label = (t: { object: string; colour: string | null; seen: boolean }) => `${t.colour ?? ''} ${t.object}${t.seen ? ' (seen)' : ''}`.trim();

  it('always offers cup, white cup, grey cup, bottle and apple, marking what is seen in reach', () => {
    const raw = {
      objects: [
        { name: 'chair', colour: 'blue', position_mm: [300, 0, 0] },
        { name: 'cup', colour: 'blue', position_mm: [400, 0, 0] },
        { name: 'cup', colour: 'grey', position_mm: [2000, 0, 0] },
        { name: 'banana', colour: 'yellow', position_mm: [300, 0, 0] },
      ],
    };
    // a blue cup in reach: any cup is there, but no white one; the grey one is too far to count
    expect(thingChoices(raw, REACH_MM.arm).map(label)).toEqual(['cup (seen)', 'white cup', 'grey cup', 'bottle', 'apple']);
  });

  it('marks a colour only when that colour is seen', () => {
    const raw = { objects: [{ name: 'cup', colour: 'white', position_mm: [500, 0, 0] }, { name: 'apple', colour: 'red', position_mm: [600, 0, 0] }] };
    expect(thingChoices(raw, REACH_MM.arm).map(label)).toEqual(['cup (seen)', 'white cup (seen)', 'grey cup', 'bottle', 'apple (seen)']);
  });

  it('offers the list unmarked when the camera does not answer', () => {
    expect(thingChoices(null, REACH_MM.arm).map(label)).toEqual(['cup', 'white cup', 'grey cup', 'bottle', 'apple']);
  });

  it('says the colour before the object', () => {
    const tr = (k: string) => ({ colBlue: '파란', objCup: '컵' })[k] ?? k;
    expect(thingText({ object: 'cup', colour: 'blue', seen: true }, tr as never)).toBe('파란 컵');
    expect(thingText({ object: 'cup', colour: null, seen: false }, tr as never)).toBe('컵');
  });
});

describe('readings', () => {
  it('reads markers and songs', () => {
    expect(toMarkers({ markers: ['home', 'p1', 3, ''] })).toEqual(['home', 'p1']);
    expect(toMarkers({ error: 'timeout' })).toEqual([]);
    expect(toSongs({ songs: [{ id: 'A', title: 'BAD', title_ko: '배드' }, { id: 'B', title: 'X' }, { title: 'no id' }] })).toEqual([
      { id: 'A', title: 'BAD', titleKo: '배드' },
      { id: 'B', title: 'X', titleKo: 'X' },
    ]);
    expect(toSongs(null)).toEqual([]);
  });

  it('steps the volume in tens within 0 to 100', () => {
    expect(stepVolume(55, 10)).toBe(70);
    expect(stepVolume(60, -10)).toBe(50);
    expect(stepVolume(95, 10)).toBe(100);
    expect(stepVolume(5, -10)).toBe(0);
  });

  it('reads the last skill with its reason', () => {
    expect(toSkillState({ status: 'refused', skill: 'move', reason: 'no cup seen', log: [] })).toEqual({
      status: 'refused',
      skill: 'move',
      reason: 'no cup seen',
    });
    expect(toSkillState({ status: 'idle', log: [] })).toEqual({ status: 'idle', skill: null, reason: null });
    expect(toSkillState({ status: 'new' })).toBeNull();
  });
});

describe('requests', () => {
  it('picks as a one step mission, the way voice does it', () => {
    expect(pickRequest({ object: 'cup', colour: 'blue', seen: true }, 'ko')).toEqual({
      path: '/tasks/steps',
      body: { steps: [{ do: 'pick', object: 'cup', colour: 'blue' }], lang: 'ko', sender: null },
      timeoutMs: 10000,
    });
  });

  it('fetches from a marker to here or a marker, and carries with what to do there', () => {
    expect(fetchRequest({ object: 'apple', colour: null, seen: false }, { marker: 'p1' }, 'here', 'place').body).toEqual({
      object: 'apple',
      colour: null,
      source: { marker: 'p1' },
      dest: 'here',
      finish: 'place',
    });
    expect(carryRequest('p3', 'hold').body).toEqual({ dest: { marker: 'p3' }, then: null, on: null });
    expect(carryRequest('p3', 'give').body).toEqual({ dest: { marker: 'p3' }, then: 'give', on: null });
  });

  it('turns left with a positive angle', () => {
    expect(turnRequest('left', 'en').body).toMatchObject({ steps: [{ do: 'turn', deg: 45 }] });
    expect(turnRequest('right', 'en').body).toMatchObject({ steps: [{ do: 'turn', deg: -45 }] });
    expect(turnRequest('around', 'en').body).toMatchObject({ steps: [{ do: 'turn', deg: 180 }] });
  });

  it('looks left with a positive yaw, and up or down keeping the yaw the head has', () => {
    const body = (x: ReturnType<typeof lookStep>) => ('req' in x ? x.req.body : x);
    // a step from where the head is: two from the bottom reach the top
    expect(body(lookStep('up', 0, -5))).toEqual({ yaw: 0, pitch: 15 });
    expect(lookStep('up', 0, 15)).toMatchObject({ req: { body: { yaw: 0, pitch: 35 } }, edge: 'top' });
    expect(lookStep('up', 0, 35)).toEqual({ reached: 'top' });
    expect(lookStep('down', 12, -5)).toEqual({ reached: 'bottom' });
    expect(body(lookStep('down', 12, 35))).toEqual({ yaw: 12, pitch: 15 });
    // sides in steps of 20 to 60; + yaw is Lumi's left
    expect(body(lookStep('left', 10, 0))).toEqual({ yaw: 30 });
    expect(lookStep('left', 50, 0)).toMatchObject({ req: { body: { yaw: 60 } }, edge: 'left' });
    expect(lookStep('right', -60, 0)).toEqual({ reached: 'right' });
    expect(body(lookStep('right', null, null))).toEqual({ yaw: -20 });
    expect(body(lookStep('centre', 30, 20))).toEqual({ yaw: 0, pitch: -5 });
    expect(headPoseOf({ body: { head_yaw_deg: 20, head_pitch_deg: -5 } })).toEqual({ yaw: 20, pitch: -5 });
    expect(headPoseOf({})).toBeNull();
  });

  it('says and asks through the assistant while it runs (it owns the speaker), else directly', () => {
    expect(sayRequest('hi', off, 'en')).toMatchObject({ path: '/say', body: { text: 'hi' } });
    expect(sayRequest('hi', greeter, 'en')).toMatchObject({ path: '/tasks/steps', body: { steps: [{ do: 'say', text: 'hi' }] } });
    expect(askRequest('what time is it', null)).toMatchObject({ path: '/ask', body: { question: 'what time is it', speak: true } });
    expect(askRequest('what time is it', patrol)).toMatchObject({ path: '/tasks/command', body: { text: 'what time is it' } });
  });

  it('sings by id with the proposed /sing, else with the words voice takes', () => {
    const song = { id: 'RESCENE_LOVE_ATTACK', title: 'Love Attack', titleKo: '러브 어택' };
    expect(singRequest(song, true)).toEqual({ path: '/sing', body: { id: 'RESCENE_LOVE_ATTACK' } });
    expect(singRequest(null, true)).toEqual({ path: '/sing', body: { id: null } });
    expect(singRequest(song, false)).toMatchObject({ path: '/tasks/command', body: { text: 'sing Love Attack' } });
    expect(singRequest(null, false)).toMatchObject({ body: { text: 'sing a song' } });
  });
});

describe('blocked', () => {
  const ready = { modes: greeter, armOn: true, holding: false };

  it('asks for Greeter or Patrol, Patrol for the base, the arm, and the right hand', () => {
    expect(blocked(['modes', 'arm', 'empty'], ready)).toBeNull();
    expect(blocked(['modes'], { ...ready, modes: off })).toBe('cmdNeedModes');
    expect(blocked(['modes'], { ...ready, modes: null })).toBe('cmdNeedModes');
    expect(blocked(['patrol'], ready)).toBe('cmdNeedPatrol');
    expect(blocked(['patrol'], { ...ready, modes: patrol })).toBeNull();
    expect(blocked(['arm'], { ...ready, armOn: false })).toBe('cmdNeedArm');
    expect(blocked(['empty'], { ...ready, holding: true })).toBe('cmdNeedEmpty');
    expect(blocked(['holding'], ready)).toBe('cmdNeedHolding');
  });

  it('does not stop anything on a hand it does not know about', () => {
    expect(blocked(['empty'], { ...ready, holding: null })).toBeNull();
    expect(blocked(['holding'], { ...ready, holding: null })).toBeNull();
  });
});

describe('typed commands', () => {
  // shapes of lumi-wave api/server.py task_parse replies
  it('starts a mission with the language it was written in', () => {
    const p = toParsed({
      action: 'steps',
      steps: [{ do: 'pick', object: 'cup', colour: null }, { do: 'place', on: null }],
      lang: 'ko',
      sender: null,
      sentence: 'Take the cup, then put it on the table.',
      problems: [],
      read_by: 'rules',
    });
    expect(parsedStart(p, 'en')).toEqual({
      path: '/tasks/steps',
      body: { steps: [{ do: 'pick', object: 'cup', colour: null }, { do: 'place', on: null }], lang: 'ko', sender: null },
      timeoutMs: 10000,
    });
    expect(parsedMoves(p)).toBe(true);
  });

  it('starts a fetch, a carry, a give and a place with their own endpoints', () => {
    const task = { object: 'apple', colour: 'red', source: { marker: 'p1' }, dest: { marker: 'home' }, finish: 'hold' };
    expect(parsedStart(toParsed({ action: 'fetch', task, problems: [], sentence: 'x' }), 'en')).toMatchObject({ path: '/tasks/fetch', body: task });
    expect(
      parsedStart(toParsed({ action: 'carry', task: { dest: { marker: 'p2' }, then: 'give', on: null }, problems: [] }), 'en'),
    ).toMatchObject({ path: '/tasks/carry', body: { dest: { marker: 'p2' }, then: 'give', on: null } });
    expect(parsedStart(toParsed({ action: 'give', task: { on: null }, problems: [] }), 'en')).toMatchObject({ path: '/tasks/give' });
    expect(parsedStart(toParsed({ action: 'place', task: { on: { name: 'chair', colour: 'orange' } }, problems: [] }), 'en')).toEqual({
      path: '/tasks/place',
      body: { on: { name: 'chair', colour: 'orange' } },
    });
  });

  it('hands commands and answers to the assistant; only moves are asked first', () => {
    const follow = toParsed({ action: 'command', text: 'follow me', sentence: 'Follow me.', problems: [], base: true });
    expect(parsedStart(follow, 'en')).toMatchObject({ path: '/tasks/command', body: { text: 'follow me' } });
    expect(parsedMoves(follow)).toBe(true);
    const song = toParsed({ action: 'command', text: 'sing a song', talk: 'sing', sentence: 'Sing.', problems: [] });
    expect(parsedMoves(song)).toBe(false);
    expect(parsedMoves(toParsed({ action: 'command', text: 'stop', sentence: 'Stop.', problems: [] }))).toBe(false);
  });

  it('starts nothing with a problem or no action, and drops the robot\'s dash for nothing', () => {
    const p = toParsed({ action: null, task: null, talk: 'talk', sentence: '–', problems: ["I didn't understand: dance"] });
    expect(p.sentence).toBe('');
    expect(parsedStart(p, 'en')).toBeNull();
    expect(parsedStart(toParsed({ action: 'fetch', task: {}, problems: ['Where should I bring it?'] }), 'en')).toBeNull();
    expect(parsedMoves(p)).toBe(false);
  });
});

describe('toOutcome', () => {
  it('tells sent, done, done by the assistant, refused with its reason and no answer apart', () => {
    expect(toOutcome({ ok: true, data: { ok: true, by: 'api' } }, false).phase).toBe('sent');
    expect(toOutcome({ ok: true, data: { ok: true } }, true).phase).toBe('done');
    expect(toOutcome({ ok: true, data: { ok: true, by: 'assistant' } }, false).phase).toBe('assistant');
    expect(toOutcome({ ok: false, status: 409, reason: 'Busy with a task. Pause or stop it first.' }, false)).toEqual({
      phase: 'refused',
      reason: 'Busy with a task. Pause or stop it first.',
      answer: null,
    });
    expect(toOutcome({ ok: false, status: 0, reason: null }, true).phase).toBe('lost');
  });

  it('keeps the answer /ask gives back', () => {
    expect(toOutcome({ ok: true, data: { answer: ' I can fetch things. ', llm_seconds: 1.2 } }, true).answer).toBe('I can fetch things.');
  });
});

describe('stepLine', () => {
  const words: Record<string, string> = {
    cmdStepGo: 'Go to {to}',
    cmdStepMove: 'Drive {m} m {dir}',
    cmdDirRight: 'right',
    cmdStepTurnRight: 'Turn right {deg}°',
    cmdStepPickColour: 'Take the {colour} {object}',
    colRed: 'red',
    objApple: 'apple',
    cmdStepWait: 'Wait {s} s',
    cmdStepSay: 'Say “{text}”',
    cmdStepOther: 'Do {name}',
    cmdStepGoBack: 'Come back here',
  };
  const say = (s: Record<string, unknown>) => stepText(stepLine(s), ((k: string) => words[k] ?? k) as never);

  it('writes every step of docs/17 as a line', () => {
    expect(say({ do: 'go', to: 'p3' })).toBe('Go to p3');
    expect(say({ do: 'go', to: 'here' })).toBe('Come back here');
    expect(say({ do: 'move', dir: 'right', m: 1 })).toBe('Drive 1 m right');
    expect(say({ do: 'turn', deg: -90 })).toBe('Turn right 90°');
    expect(say({ do: 'pick', object: 'apple', colour: 'red' })).toBe('Take the red apple');
    expect(say({ do: 'wait', s: 120 })).toBe('Wait 120 s');
    expect(say({ do: 'say', text: 'Anvar says hello' })).toBe('Say “Anvar says hello”');
    expect(say({ do: 'dance' })).toBe('Do dance');
  });
});

describe('seenThings', () => {
  const raw = {
    objects: [
      { name: 'cup', colour: 'blue', position_mm: [-1264, 2072, -150] }, // the far "cup" of 2026-11-19
      { name: 'chair', colour: 'blue', position_mm: [-994, 2072, -384] },
      { name: 'bottle', colour: 'white', position_mm: [-150, 600, -330] },
      { name: 'cup', colour: 'red', position_mm: [-120, 560, -330] },
      { name: 'cup', colour: 'red', position_mm: [-110, 570, -330] },
      { name: 'apple', colour: 'red', position_mm: null },
      { name: 'orange', colour: 'orange', position_mm: [900, 900, -330] },
    ],
  };
  it('offers only things Lumi can take within reach, nearest first and each once', () => {
    expect(seenThings(raw, REACH_MM.arm)).toEqual([
      { object: 'cup', colour: 'red', seen: true },
      { object: 'bottle', colour: 'white', seen: true },
    ]);
  });
  it('reaches further when the base may drive closer', () => {
    expect(seenThings(raw, REACH_MM.drive).map((t) => t.object)).toEqual(['cup', 'bottle', 'orange']);
  });
  it('is empty without a reading', () => {
    expect(seenThings(null, REACH_MM.arm)).toEqual([]);
  });
});

describe('parseThing', () => {
  const words = (k: Parameters<typeof textOf>[1]) => [textOf('en', k), textOf('ko', k)];
  it.each([
    ['blue cup', 'cup', 'blue'],
    ['  the Red BOTTLE please ', 'bottle', 'red'],
    ['cup', 'cup', null],
    ['orange', 'orange', null],
    ['orange cup', 'cup', 'orange'],
    ['gray cup', 'cup', 'grey'],
    ['파란 컵', 'cup', 'blue'],
    ['파란컵', 'cup', 'blue'],
    ['빨간색 사과', 'apple', 'red'],
    ['병', 'bottle', null],
  ])('%s', (typed, object, colour) => {
    expect(parseThing(typed, words)).toEqual({ object, colour, seen: false });
  });
  it('is null for something Lumi cannot take', () => {
    expect(parseThing('chair', words)).toBeNull();
    expect(parseThing('', words)).toBeNull();
  });
});
