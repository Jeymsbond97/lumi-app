// The Drive screen's speed (style D), on the touch responder like the joystick: drag anywhere on the track, or tap minus / plus for steps of 5 %. The value is
// whole percents (lib/speed). onChange follows the finger; onRelease comes once when it lifts; onStep after a tap.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { fractionOf, SPEED_STEP, stepPercent, valueAt, type SpeedRange } from '../lib/speed';
import { fonts, mono } from './theme';

interface Props {
  value: number;
  range: SpeedRange;
  /** The panel's text size. */
  size: number;
  /** The touch height; the track takes the whole of it. */
  height: number;
  label: string;
  /** Small light minus and plus circles (touched over 44 px) and a brighter percent: for Drive's glass card. */
  light?: boolean;
  lessLabel: string;
  moreLabel: string;
  onChange: (v: number) => void;
  onRelease: (v: number) => void;
  onStep: (v: number) => void;
}

export function SpeedSlider({ value, range, size, height, label, light, lessLabel, moreLabel, onChange, onRelease, onStep }: Props) {
  const thumb = Math.round(height * 0.46);
  const pad = thumb / 2;
  const width = useRef(0);
  const startX = useRef(0);
  const startPageX = useRef(0);
  const last = useRef(value);
  const [dragging, setDragging] = useState(false);

  const move = (x: number) => {
    const v = valueAt(x - pad, width.current - 2 * pad, range);
    if (v === last.current) return;
    last.current = v;
    onChange(v);
  };
  const onGrant = (e: GestureResponderEvent) => {
    Haptics.selectionAsync().catch(() => {});
    setDragging(true);
    startX.current = e.nativeEvent.locationX;
    startPageX.current = e.nativeEvent.pageX;
    move(startX.current);
  };
  const onMove = (e: GestureResponderEvent) => move(startX.current + e.nativeEvent.pageX - startPageX.current);
  const onEnd = () => {
    setDragging(false);
    onRelease(last.current);
  };

  useEffect(() => {
    if (!dragging) last.current = value;
  }, [value, dragging]);

  const step = (by: number) => {
    const v = stepPercent(value, by, range);
    if (v === value) return;
    Haptics.selectionAsync().catch(() => {});
    onStep(v);
  };

  const f = fractionOf(value, range);
  const button = light ? LIGHT_STEP : Math.round(height * 0.8);
  return (
    <View style={[styles.row, { gap: size * 0.5 }]}>
      <Text style={[styles.label, { fontSize: light ? size * 0.78 : size }]}>{label}</Text>
      <StepButton glyph="M6 12 H18" size={button} light={light} label={lessLabel} onPress={() => step(-SPEED_STEP)} />
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onEnd}
        onResponderTerminate={onEnd}
        onLayout={(e: LayoutChangeEvent) => {
          width.current = e.nativeEvent.layout.width;
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: range.min, max: range.max, now: value, text: `${value}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? SPEED_STEP : -SPEED_STEP)}
        style={[styles.touch, { height, paddingHorizontal: pad }]}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${f * 100}%` }]} />
        </View>
        {/* the thumb's left edge runs over the track's length, so its centre is on the value */}
        <View pointerEvents="none" style={[styles.thumbLane, { right: thumb }]}>
          <View
            style={[
              styles.thumb,
              { width: thumb, height: thumb, borderRadius: thumb / 2, top: (height - thumb) / 2, left: `${f * 100}%` },
              dragging && styles.thumbHeld,
            ]}
          />
        </View>
      </View>
      <StepButton glyph="M6 12 H18 M12 6 V18" size={button} light={light} label={moreLabel} onPress={() => step(SPEED_STEP)} />
      <Text style={[styles.value, light ? [styles.valueLight, { fontSize: size * 1.25, minWidth: size * 3.4 }] : { fontSize: size, minWidth: size * 3 }]}>
        {`${value}%`}
      </Text>
    </View>
  );
}

/** The light minus and plus: a small drawn circle. */
const LIGHT_STEP = 24;

function StepButton({ glyph, size, label, light, onPress }: { glyph: string; size: number; label: string; light?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={light ? (44 - size) / 2 : 4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.step,
        { width: size, height: size, borderRadius: size / 2 },
        light && styles.stepLight,
        pressed && (light ? styles.stepLightPressed : styles.pressed),
      ]}
    >
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" pointerEvents="none">
        <Path d={glyph} stroke={mono.text} strokeWidth={light ? 2 : 2.4} fill="none" strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}

// keeps small words readable over the camera picture
const shadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1, textTransform: 'uppercase', ...shadow },
  value: { fontFamily: fonts.monoBold, color: mono.text, textAlign: 'right', ...shadow },
  touch: { flex: 1, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(232,232,232,0.22)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: mono.text },
  thumbLane: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  thumb: {
    position: 'absolute',
    backgroundColor: mono.text,
    borderWidth: 2,
    borderColor: '#000',
  },
  thumbHeld: { backgroundColor: mono.red },
  step: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(232,232,232,0.35)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  stepLight: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' },
  stepLightPressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  valueLight: { color: '#ffffff', letterSpacing: 0.5 },
  pressed: { opacity: 0.6 },
});
