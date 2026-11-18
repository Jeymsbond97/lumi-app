// E-STOP, right of STOP: a pause for a drive. Pressed, the base halts where it is (the base's soft E-stop) and the drive
// waits; pressed again (RESUME), the same drive or route goes on from there. STOP still cancels everything.
// It shows on the Map always and on every other screen while Lumi drives or is held, so a held Lumi can always be
// released. While the red button on Lumi is pressed only a hand on the robot releases it: E-STOP turns dark red and
// a tap only buzzes. No words pop up over it (owner, 2026-11-18); the button's own look says held or not.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { setEstop } from '../lib/api';
import { estopLook, estopShown } from '../lib/baseInfo';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { stopSize } from './StopButton';
import { clamp, fonts, mono } from './theme';

const WANT_MS = 4000;
const PULSE_MS = 900;
// room between STOP (with its glow ring) and E-STOP, so a thumb does not hit both (owner, 2026-11-18)
const GAP = 34;

export function EstopButton() {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  const path = usePathname();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [want, setWant] = useState<{ on: boolean } | null>(null);
  const base = status?.base ?? null;

  // what was pressed shows until the base says the same, or for WANT_MS at most: then the base's own state shows
  useEffect(() => {
    if (!want) return;
    const id = setTimeout(() => setWant(null), WANT_MS);
    return () => clearTimeout(id);
  }, [want]);
  const pending = want && base?.softEstop !== want.on ? want.on : null;

  const look = estopLook(base, pending);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = look === 'held' ? withRepeat(withTiming(0.55, { duration: PULSE_MS }), -1, true) : withTiming(1);
  }, [look, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!estopShown(path === '/map', base) && !want) return null;

  const onPress = () => {
    if (look === 'hard') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    const on = look !== 'held';
    Haptics.impactAsync(on ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setWant({ on });
    setEstop(connection.baseUrl, on).catch(() => {
      setWant(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    });
  };

  const stop = stopSize(h);
  const size = clamp(44, 0.5 * stop, 60);
  const held = look === 'held';
  // red like STOP (owner, 2026-11-18): outlined while ready, filled while held, dark red while the red button on Lumi holds it
  const color = held || look === 'hard' ? mono.text : mono.red;
  return (
    <View
      style={[styles.root, { left: 24 + inset.left + stop + GAP, bottom: 18 + inset.bottom + (stop - size) / 2 }]}
      pointerEvents="box-none"
    >
      <Animated.View style={held ? pulseStyle : undefined}>
        <Pressable
          onPress={onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: held }}
          accessibilityLabel={held ? t('estopResume') : t('estop')}
          style={({ pressed }) => [
            styles.button,
            { height: size, borderRadius: size / 2, paddingHorizontal: size * 0.28 },
            held && styles.held,
            look === 'hard' && styles.hard,
            pressed && styles.pressed,
          ]}
        >
          <Svg width={size * 0.32} height={size * 0.32} viewBox="0 0 24 24">
            {held ? (
              <Path d="M7 4.5v15l12.5-7.5z" fill={color} />
            ) : (
              <>
                <Rect x={5} y={4} width={4.5} height={16} rx={1.2} fill={color} />
                <Rect x={14.5} y={4} width={4.5} height={16} rx={1.2} fill={color} />
              </>
            )}
          </Svg>
          <Text style={[styles.label, { color, fontSize: clamp(11, size * 0.26, 15) }]}>{held ? t('estopResume') : t('estop')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-start', gap: 10 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: mono.red,
    backgroundColor: 'rgba(8,8,8,0.92)',
  },
  held: { backgroundColor: mono.red, borderColor: mono.red },
  hard: { backgroundColor: '#5c0b0b', borderColor: mono.red },
  pressed: { transform: [{ scale: 0.95 }] },
  label: { fontFamily: fonts.monoBold, letterSpacing: 1, textTransform: 'uppercase' },
});
