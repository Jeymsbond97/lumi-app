// The sections, bottom centre between the joystick and STOP (style D): one dark pill of words, the open one white with
// a red dot. A section whose screen is not built yet is dimmed; tapping it says so for a moment.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useI18n, type TextKey } from '../lib/i18n';
import { clamp, fonts, mono } from './theme';

const NOTE_MS = 2000;

interface Section {
  label: TextKey;
  /** null until the screen exists. */
  route: Href | null;
  path: string;
}

export const SECTIONS: Section[] = [
  { label: 'tabHome', route: '/home', path: '/home' },
  { label: 'tabCommands', route: '/commands', path: '/commands' },
  { label: 'tabDrive', route: '/drive', path: '/drive' },
  { label: 'tabMap', route: '/map', path: '/map' },
  { label: 'tabTalk', route: '/talk', path: '/talk' },
];

export function Dock() {
  const { t } = useI18n();
  const path = usePathname();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [note, setNote] = useState(false);
  const text = clamp(11, 0.02 * h, 15);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(false), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  const open = (s: Section) => {
    if (s.path === path) return;
    Haptics.selectionAsync().catch(() => {});
    if (s.route) router.navigate(s.route);
    else setNote(true);
  };

  return (
    <View style={[styles.row, { bottom: 18 + inset.bottom }]} pointerEvents="box-none">
      {note && <Text style={[styles.note, { fontSize: text }]}>{t('soon')}</Text>}
      <View style={[styles.pill, { paddingHorizontal: text * 0.6, paddingVertical: text * 0.3 }]}>
        {SECTIONS.map((s) => {
          const on = s.path === path;
          return (
            <Pressable
              key={s.path}
              onPress={() => open(s)}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{ selected: on, disabled: !s.route }}
              style={({ pressed }) => [
                styles.tab,
                { paddingHorizontal: text * 1.1, paddingVertical: text * 0.65, gap: text * 0.45 },
                pressed && styles.pressed,
              ]}
            >
              {on && <View style={[styles.dot, { width: text * 0.5, height: text * 0.5 }]} />}
              <Text style={[styles.label, { fontSize: text }, on && styles.labelOn, !s.route && styles.labelSoon]}>
                {t(s.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(232,232,232,0.14)',
  },
  tab: { flexDirection: 'row', alignItems: 'center', borderRadius: 999 },
  pressed: { opacity: 0.6 },
  dot: { borderRadius: 99, backgroundColor: mono.red },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1.5, textTransform: 'uppercase' },
  labelOn: { fontFamily: fonts.monoBold, color: mono.text },
  labelSoon: { color: mono.dim },
  note: {
    fontFamily: fonts.mono,
    color: mono.text,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
});
