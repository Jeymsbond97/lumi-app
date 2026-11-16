// Every word the app shows lives here, in English (default) and Korean.
// `ko` is typed against `en`, so a text added in one language and missing in the other does not compile.
// UI copy uses dashes and commas only where a sentence really needs them.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'en' | 'ko';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ko', label: '한국어' },
];

const en = {
  // loading screen
  connecting: 'Connecting to Lumi',
  connected: 'Connected',
  connectNoteBefore: 'Please connect to the ',
  connectNoteWifi: 'Lumi Wi‑Fi',
  connectNoteAfter: ' first',
  // robot state
  statusReady: 'Ready',
  statusMoving: 'Moving',
  statusBaseOffline: 'Base offline',
  battery: 'Battery',
  charging: 'Charging',
  armOff: 'Arm off',
  armDisabled: 'Arm disabled',
  armEnabled: 'Arm enabled',
  armError: 'Arm error',
  armDrag: 'Free drive',
  bodyOn: 'Body on',
  bodyOff: 'Body off',
  bodyEnabled: 'Body enabled',
  bodyDisabled: 'Body disabled',
  bodyEnableAsk: 'Enable the body?',
  bodyDisableAsk: 'Disable the body? Head, waist and lift will not move until it is enabled again.',
  armEnableAsk: 'Enable the arm?',
  armDisableAsk: 'Disable the arm? It holds by its brakes.',
  armPowerAsk: 'Turn on the arm power?',
  powerOn: 'Power on',
  powerOff: 'Power off',
  enable: 'Enable',
  disable: 'Disable',
  cancel: 'Cancel',
  head: 'Head',
  waist: 'Waist',
  lift: 'Lift',
  // sections
  tabHome: 'Home',
  tabCommands: 'Commands',
  tabDrive: 'Drive',
  tabMap: 'Map',
  tabTalk: 'Talk',
  soon: 'Coming soon',
  // safety
  stop: 'STOP',
  stopSent: 'Stopped',
  noAnswer: 'Lumi did not answer',
  busy: 'Lumi is busy with a task',
  drive: 'Drive',
  slideToDrive: 'Slide to drive',
  driveOn: 'Drive on',
  unlockDriving: 'Unlock driving',
  // modes
  modes: 'Modes',
  modeGreeter: 'Greeter',
  modePatrol: 'Patrol',
  modeWave: 'Wave',
  modeWelcome: 'Welcome',
  welcomeOnCharger: 'Welcome works only on the charger',
  // current task
  taskRunning: 'Working',
  taskWaiting: 'Waiting',
  taskHolding: 'Holding it',
  taskDone: 'Done',
  taskStopped: 'Stopped',
  taskFailed: 'Could not finish',
  taskPaused: 'Paused',
  pause: 'Pause',
  resume: 'Resume',
  stopTask: 'Stop',
  release: 'Release',
  stepPreparing: 'Getting ready',
  stepLooking: 'Looking for it',
  stepDrivingSource: 'Driving to the object',
  stepDrivingDestination: 'Driving to the destination',
  stepDrivingRound: 'Driving around it',
  stepTurning: 'Turning to reach it',
  stepAskingCloser: 'Asking to move it closer',
  stepReaching: 'Reaching',
  stepPicking: 'Picking it up',
  stepCarrying: 'Carrying it',
  stepPlacing: 'Putting it down',
  stepGiving: 'Handing it over',
  stepReceiving: 'Taking it from you',
  stepSpeaking: 'Speaking',
  stepWaiting: 'Waiting',
  // settings
  language: 'Language',
};

export type TextKey = keyof typeof en;

const ko: Record<TextKey, string> = {
  connecting: 'Lumi에 연결하는 중',
  connected: '연결됨',
  connectNoteBefore: '먼저 ',
  connectNoteWifi: 'Lumi Wi‑Fi',
  connectNoteAfter: '에 연결해 주세요',
  statusReady: '준비됨',
  statusMoving: '이동 중',
  statusBaseOffline: '베이스 연결 끊김',
  battery: '배터리',
  charging: '충전 중',
  armOff: '로봇팔 꺼짐',
  armDisabled: '로봇팔 비활성',
  armEnabled: '로봇팔 활성',
  armError: '로봇팔 오류',
  armDrag: '프리 드라이브',
  bodyOn: '몸체 켜짐',
  bodyOff: '몸체 꺼짐',
  bodyEnabled: '몸체 활성',
  bodyDisabled: '몸체 비활성',
  bodyEnableAsk: '몸체를 활성화할까요?',
  bodyDisableAsk: '몸체를 비활성화할까요? 다시 활성화할 때까지 머리, 허리, 리프트가 움직이지 않아요.',
  armEnableAsk: '로봇팔을 활성화할까요?',
  armDisableAsk: '로봇팔을 비활성화할까요? 팔은 브레이크로 고정돼요.',
  armPowerAsk: '로봇팔 전원을 켤까요?',
  powerOn: '전원 켜기',
  powerOff: '전원 끄기',
  enable: '활성화',
  disable: '비활성화',
  cancel: '취소',
  head: '머리',
  waist: '허리',
  lift: '리프트',
  tabHome: '홈',
  tabCommands: '명령',
  tabDrive: '주행',
  tabMap: '지도',
  tabTalk: '대화',
  soon: '곧 추가돼요',
  stop: '정지',
  stopSent: '정지했어요',
  noAnswer: 'Lumi가 응답하지 않아요',
  busy: 'Lumi가 작업 중이에요',
  drive: '주행',
  slideToDrive: '밀어서 주행',
  driveOn: '주행 켜짐',
  unlockDriving: '주행 잠금 해제',
  modes: '모드',
  modeGreeter: '인사',
  modePatrol: '순찰',
  modeWave: '손 인사',
  modeWelcome: '환영',
  welcomeOnCharger: '환영 모드는 충전기 위에서만 켤 수 있어요',
  taskRunning: '작업 중',
  taskWaiting: '기다리는 중',
  taskHolding: '들고 있어요',
  taskDone: '완료',
  taskStopped: '정지됨',
  taskFailed: '끝내지 못했어요',
  taskPaused: '일시 정지',
  pause: '일시 정지',
  resume: '계속',
  stopTask: '정지',
  release: '놓기',
  stepPreparing: '준비 중',
  stepLooking: '찾는 중',
  stepDrivingSource: '물건으로 가는 중',
  stepDrivingDestination: '목적지로 가는 중',
  stepDrivingRound: '돌아서 가는 중',
  stepTurning: '잡으려고 도는 중',
  stepAskingCloser: '더 가까이 놓아 달라고 하는 중',
  stepReaching: '팔을 뻗는 중',
  stepPicking: '집는 중',
  stepCarrying: '옮기는 중',
  stepPlacing: '내려놓는 중',
  stepGiving: '건네주는 중',
  stepReceiving: '받는 중',
  stepSpeaking: '말하는 중',
  stepWaiting: '기다리는 중',
  language: '언어',
};

const STRINGS: Record<Lang, Record<TextKey, string>> = { en, ko };
const STORAGE_KEY = 'lumi.lang';

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TextKey) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'en' || v === 'ko') setLangState(v);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const value = useMemo<I18n>(() => ({ lang, setLang, t: (key) => STRINGS[lang][key] }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
