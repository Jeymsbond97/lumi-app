// STOP on every screen, bottom left: one tap, no confirmation. It stops the base, the arm, the task and the assistant.
// It is never disabled and never waits for an earlier tap: every tap sends STOP again.
// Look (owner's pick A, 2026-11-16): a red disc in a thin red ring, with a slow wave going out so it is always seen.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSteadyWindow } from '../lib/steadyWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { stopAll } from '../lib/api';
import { emitDriveStop } from '../lib/driveLock';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts, mono } from './theme';

const NOTE_MS = 2500;
const WAVE_MS = 2200;
const RING = 5; // the dark gap and the red ring around the disc, px

/** The button's size for a screen height; the modes panel sits above it. */
export const stopSize = (h: number) => clamp(64, 0.14 * h, 112);

export function StopButton() {
  const { t, lang } = useI18n();
  const { connection } = useRobot();
  const { height: h } = useSteadyWindow();
  const inset = useSafeAreaInsets();
  const [note, setNote] = useState<'stopSent' | 'noAnswer' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const size = stopSize(h);

  useEffect(() => () => clearTimeout(timer.current), []);

  // the wave: grows from the ring and fades, over and over (it follows the system's reduce motion setting)
  const wave = useSharedValue(0);
  useEffect(() => {
    wave.value = withRepeat(withTiming(1, { duration: WAVE_MS, easing: Easing.out(Easing.quad) }), -1, false);
  }, [wave]);
  const waveStyle = useAnimatedStyle(() => ({
    opacity: 0.8 * (1 - wave.value),
    transform: [{ scale: 1 + 0.45 * wave.value }],
  }));

  const show = (n: 'stopSent' | 'noAnswer') => {
    setNote(n);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), NOTE_MS);
  };

  const onPress = () => {
    emitDriveStop(); // the joystick locks too
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
    <View style={[styles.root, { left: 24 + inset.left, bottom: 18 + inset.bottom }]} pointerEvents="box-none">
      {note && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} style={styles.note}>
          <Text style={[styles.noteText, note === 'noAnswer' && styles.noteBad]}>{t(note)}</Text>
        </Animated.View>
      )}
      <View style={{ width: size, height: size }}>
        <Animated.View
          pointerEvents="none"
          style={[styles.wave, { width: size, height: size, borderRadius: size / 2 }, waveStyle]}
        />
        <Pressable
          onPress={onPress}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('stop')}
          style={({ pressed }) => [styles.ring, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.button,
                { width: size - 2 * RING, height: size - 2 * RING, borderRadius: size / 2 - RING },
                pressed && styles.buttonPressed,
              ]}
            >
              {/* Doto has no Hangul: Korean uses the system font, bold */}
              <Text style={[lang === 'en' ? styles.label : styles.labelSystem, { fontSize: size * 0.22 }]}>{t('stop')}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-start', gap: 10 },
  wave: { position: 'absolute', borderWidth: 2, borderColor: mono.red },
  // the red ring, then a dark gap, then the disc
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: mono.red,
    backgroundColor: '#0a0b0d',
    shadowColor: mono.red,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  pressed: { transform: [{ scale: 0.94 }] },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mono.red,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)', // a little light on top, like the mockup's gradient
  },
  buttonPressed: { backgroundColor: '#b81f1f' },
  label: { fontFamily: fonts.dot, color: '#000', letterSpacing: 1 },
  labelSystem: { fontWeight: '800', color: '#000' },
  note: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: mono.dim,
  },
  noteText: { fontFamily: fonts.mono, fontSize: 14, color: mono.text, textTransform: 'uppercase' },
  noteBad: { color: mono.red },
});
