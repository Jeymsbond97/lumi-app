// An upright speed fader in dark glass: the percent large in the middle, its name under it, a soft level rising from
// the bottom, small round plus (top) and minus (bottom). Drag anywhere on it to change the value (up is faster); the
// value is whole percents (lib/speed). onChange follows the finger, onRelease comes when it lifts, onStep after a tap.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { faderValue, fractionOf, SPEED_STEP, stepPercent, type SpeedRange } from '../lib/speed';
import { fonts, mono } from './theme';

/** The drawn circle of plus and minus; hitSlop makes the touch 44 px. */
const STEP_DOT = 28;

interface Props {
  value: number;
  range: SpeedRange;
  width: number;
  height: number;
  /** The text size. */
  size: number;
  label: string;
  lessLabel: string;
  moreLabel: string;
  onChange: (v: number) => void;
  onRelease: (v: number) => void;
  onStep: (v: number) => void;
}

export function SpeedFader({ value, range, width, height, size, label, lessLabel, moreLabel, onChange, onRelease, onStep }: Props) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ value, y: 0 });
  const last = useRef(value);
  useEffect(() => {
    if (!dragging) last.current = value;
  }, [value, dragging]);

  const onGrant = (e: GestureResponderEvent) => {
    Haptics.selectionAsync().catch(() => {});
    setDragging(true);
    start.current = { value, y: e.nativeEvent.pageY };
  };
  const onMove = (e: GestureResponderEvent) => {
    const v = faderValue(start.current.value, e.nativeEvent.pageY - start.current.y, height, range);
    if (v === last.current) return;
    last.current = v;
    onChange(v);
  };
  const onEnd = () => {
    setDragging(false);
    onRelease(last.current);
  };
  const step = (by: number) => {
    const v = stepPercent(value, by, range);
    if (v === value) return;
    Haptics.selectionAsync().catch(() => {});
    onStep(v);
  };

  const level = fractionOf(value, range);
  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: range.min, max: range.max, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? SPEED_STEP : -SPEED_STEP)}
      style={[styles.fader, { width, height, borderRadius: Math.min(18, width / 2) }, dragging && styles.faderHeld]}
    >
      <View pointerEvents="none" style={[styles.level, { height: `${level * 100}%` }]}>
        <View style={styles.levelEdge} />
      </View>
      <Dot glyph="M6 12 H18 M12 6 V18" label={moreLabel} onPress={() => step(SPEED_STEP)} />
      <View pointerEvents="none" style={styles.readout}>
        <Text style={[styles.value, { fontSize: size * 1.45 }]}>
          {value}
          <Text style={[styles.unit, { fontSize: size * 0.85 }]}>%</Text>
        </Text>
        <Text style={[styles.label, { fontSize: size * 0.68 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Dot glyph="M6 12 H18" label={lessLabel} onPress={() => step(-SPEED_STEP)} />
    </View>
  );
}

function Dot({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={(44 - STEP_DOT) / 2}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.dot, pressed && styles.dotPressed]}
    >
      <Svg width={STEP_DOT * 0.5} height={STEP_DOT * 0.5} viewBox="0 0 24 24" pointerEvents="none">
        <Path d={glyph} stroke={mono.text} strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  faderHeld: { borderColor: 'rgba(255,255,255,0.3)' },
  level: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.09)' },
  levelEdge: { height: 1.5, backgroundColor: 'rgba(255,255,255,0.45)' },
  readout: { alignItems: 'center' },
  value: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 0.5 },
  unit: { fontFamily: fonts.mono, color: mono.soft },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 1 },
  dot: {
    width: STEP_DOT,
    height: STEP_DOT,
    borderRadius: STEP_DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  dotPressed: { backgroundColor: 'rgba(255,255,255,0.18)' },
});
