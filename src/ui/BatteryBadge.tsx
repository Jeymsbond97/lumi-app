// Battery in the top right, left of the language button (style D): the charge as a small dot matrix number and an
// upright battery that fills with it. Green, red and blinking when low. While Lumi charges a lightning bolt shows
// inside the battery and the fill breathes; off the charger the bolt is gone. No words.
import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts, mono } from './theme';

/** At or under this the battery turns red. */
export const LOW_BATTERY = 20;

export const batteryColour = (pct: number) => (pct <= LOW_BATTERY ? mono.red : mono.green);

const W = 18; // battery body, in its own units, upright
const H = 32;
const CAP = 3;

function BatteryIcon({ pct, charging, height }: { pct: number; charging: boolean; height: number }) {
  const inner = H - 6;
  const fill = Math.max(0, Math.min(1, pct / 100)) * inner;
  const width = (height * W) / (H + CAP);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H + CAP}`}>
      <Rect x={W / 2 - 3.5} y={0} width={7} height={CAP + 1} rx={1} fill={mono.text} />
      <Rect x={1} y={CAP} width={W - 2} height={H - 1} rx={3.5} fill="none" stroke={mono.text} strokeWidth={1.6} />
      {fill > 0 && <Rect x={4} y={CAP + 3 + inner - fill} width={W - 8} height={fill - 1} rx={1.5} fill={batteryColour(pct)} />}
      {charging && (
        <Path
          d="M10.5 9 L4.5 20 H9 L7.5 29 L13.5 18 H9 Z"
          fill="#ffffff"
          stroke="#000000"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

export function BatteryBadge() {
  const { t } = useI18n();
  const { status } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const pulse = useSharedValue(1);
  const pct = status?.battery == null ? null : Math.round(status.battery);
  const charging = !!status?.charging;
  const low = pct != null && pct <= LOW_BATTERY;

  // low: blinks; charging: breathes slowly; otherwise still
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = 1;
    if (charging) pulse.value = withRepeat(withSequence(withTiming(0.55, { duration: 800 }), withTiming(1, { duration: 800 })), -1);
    else if (low) pulse.value = withRepeat(withSequence(withTiming(0.2, { duration: 0 }), withTiming(0.2, { duration: 500 }), withTiming(1, { duration: 0 }), withTiming(1, { duration: 500 })), -1);
  }, [charging, low, pulse]);
  const blink = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (pct == null) return null;
  const size = clamp(20, 0.042 * h, 30);

  return (
    <View
      style={[styles.root, { top: 14 + inset.top, right: 18 + inset.right + 36 + 14, height: 36 }]}
      accessible
      accessibilityLabel={`${t('battery')} ${pct}%${charging ? ` ${t('charging')}` : ''}`}
    >
      <Text style={[styles.pct, { fontSize: size, color: batteryColour(pct) }]}>{pct}</Text>
      <Animated.View style={blink}>
        <BatteryIcon pct={pct} charging={charging} height={size * 1.15} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  pct: { fontFamily: fonts.dot, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 },
});
