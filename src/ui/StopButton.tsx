// STOP on every screen, bottom right: one tap, no confirmation. It stops the base, the arm, the task and the assistant.
// It is never disabled and never waits for an earlier tap: every tap sends STOP again.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { stopAll } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts } from './theme';

const NOTE_MS = 2500;

/** The button's size for a screen height; the modes panel sits above it. */
export const stopSize = (h: number) => clamp(64, 0.14 * h, 112);

export function StopButton() {
  const { t, lang } = useI18n();
  const { connection } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [note, setNote] = useState<'stopSent' | 'noAnswer' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const size = stopSize(h);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (n: 'stopSent' | 'noAnswer') => {
    setNote(n);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), NOTE_MS);
  };

  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    stopAll(connection.baseUrl).then(
      () => show('stopSent'),
      () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        show('noAnswer');
      },
    );
  };

  return (
    <View style={[styles.root, { right: 24 + inset.right, bottom: 18 + inset.bottom }]} pointerEvents="box-none">
      {note && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} style={styles.note}>
          <Text style={[styles.noteText, note === 'noAnswer' && styles.noteBad]}>{t(note)}</Text>
        </Animated.View>
      )}
      <Pressable
        onPress={onPress}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('stop')}
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          pressed && styles.pressed,
        ]}
      >
        {/* Unbounded has no Hangul: Korean uses the system font, bold */}
        <Text style={[lang === 'en' ? styles.label : styles.labelSystem, { fontSize: size * (lang === 'en' ? 0.2 : 0.24) }]}>{t('stop')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-end', gap: 10 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5484d',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#ff3b30',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  pressed: { backgroundColor: '#b8262c', transform: [{ scale: 0.95 }] },
  label: { fontFamily: fonts.title, color: '#fff', letterSpacing: 1 },
  labelSystem: { fontWeight: '800', color: '#fff' },
  note: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(12,17,22,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(160,190,205,0.16)',
  },
  noteText: { fontFamily: fonts.medium, fontSize: 14, color: '#eef2f5' },
  noteBad: { color: '#ff8a80' },
});
