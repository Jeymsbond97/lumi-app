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
  charging: 'Charging',
  notCharging: 'Not charging',
  armOff: 'Arm off',
  armDisabled: 'Arm disabled',
  armEnabled: 'Arm enabled',
  armError: 'Arm error',
  armDrag: 'Free drive',
  head: 'Head',
  waist: 'Waist',
  lift: 'Lift',
  // 3D view
  dragToTurn: 'Drag to turn',
  doubleTapReset: 'Double tap to reset',
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
  charging: '충전 중',
  notCharging: '충전 안 함',
  armOff: '로봇팔 꺼짐',
  armDisabled: '로봇팔 비활성',
  armEnabled: '로봇팔 활성',
  armError: '로봇팔 오류',
  armDrag: '프리 드라이브',
  head: '머리',
  waist: '허리',
  lift: '리프트',
  dragToTurn: '드래그해서 돌리기',
  doubleTapReset: '두 번 탭하면 처음 화면',
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
