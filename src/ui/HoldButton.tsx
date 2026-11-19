// A hold-to-move button (style D): the part moves while a finger is on it and stops when it lifts. A second finger
// anywhere stops it too (React Native gives that finger to this button, even one on STOP). A button that cannot
// move its part now (disabled) takes the touch only to say why. Inside a ScrollView (`delayed`) the hold starts only
// after the finger stayed still a moment (lib/jog createDelayedPress), so a scroll that starts on it moves nothing.
// `edge` joins two buttons into one pill: the first squares its end side, the second its start side. `flat`: no frame
// of its own, for a button inside a glass module (Drive's body card), with a hairline between joined halves.
// `bare`: only the touch area, placed by `style`; its owner draws it (ARM SETUP's arcs and pads, from `jog.held`).
import { useEffect, useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { createDelayedPress, type DelayedPress, type JogCommand } from '../lib/jog';
import type { JogControl } from './useJogHold';
import { mono } from './theme';

export type Glyph = 'up' | 'down' | 'left' | 'right' | 'minus' | 'plus';

const PATHS: Record<Glyph, string> = {
  up: 'M6 15 L12 9 L18 15',
  down: 'M6 9 L12 15 L18 9',
  left: 'M15 6 L9 12 L15 18',
  right: 'M9 6 L15 12 L9 18',
  minus: 'M6 12 H18',
  plus: 'M6 12 H18 M12 6 V18',
};

export const sameJog = (a: JogCommand | null, b: JogCommand) => !!a && a.axis === b.axis && a.direction === b.direction;

export function HoldButton({
  cmd,
  jog,
  glyph,
  size,
  label,
  disabled,
  onDisabledPress,
  delayed,
  edge,
  flat,
  slop = 4,
  bare,
  style,
}: {
  cmd: JogCommand;
  jog: JogControl;
  glyph: Glyph;
  size: number;
  label: string;
  disabled?: boolean;
  onDisabledPress?: () => void;
  delayed?: boolean;
  edge?: 'start' | 'end';
  flat?: boolean;
  /** Touch room round it, for a button drawn under 44 px. */
  slop?: number;
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const held = sameJog(jog.held, cmd);

  // a held button that goes away (another page) or can no longer move its part stops it: no touch end would come
  const heldRef = useRef(held);
  const releaseRef = useRef(jog.release);
  const latest = useRef({ cmd, jog });
  useEffect(() => {
    heldRef.current = held;
    releaseRef.current = jog.release;
    latest.current = { cmd, jog };
  }, [held, jog, cmd]);

  // a delayed hold: started by the gate (made at the first touch), through the latest command and loop
  const gate = useRef<DelayedPress | null>(null);
  const makeGate = () =>
    createDelayedPress({
      start: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        latest.current.jog.press(latest.current.cmd);
      },
      stop: () => latest.current.jog.release(),
      tap: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        latest.current.jog.press(latest.current.cmd);
        latest.current.jog.release();
      },
    });

  useEffect(() => {
    if (!disabled) return;
    gate.current?.cancel();
    if (heldRef.current) releaseRef.current();
  }, [disabled]);
  useEffect(
    () => () => {
      gate.current?.cancel(); // no hold may start after the button went away
      if (heldRef.current) releaseRef.current();
    },
    [],
  );

  const onGrant = (e: GestureResponderEvent) => {
    if (disabled) {
      onDisabledPress?.();
      return;
    }
    if (delayed) {
      gate.current ??= makeGate();
      if (e.nativeEvent.touches.length <= 1) gate.current.down(e.nativeEvent.pageX, e.nativeEvent.pageY);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    jog.press(cmd, e.nativeEvent.touches.length);
  };
  const onExtraFinger = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length <= 1) return;
    gate.current?.cancel();
    jog.release();
  };
  const onMove = (e: GestureResponderEvent) => gate.current?.move(e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onRelease = () => (gate.current ? gate.current.up() : jog.release());
  const onTerminate = () => (gate.current ? gate.current.cancel() : jog.release());
  const r = size * 0.28;
  const corners =
    edge === 'start'
      ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 }
      : edge === 'end'
        ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 }
        : null;

  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => false}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderStart={onExtraFinger}
      onResponderMove={onMove}
      onResponderRelease={onRelease}
      onResponderTerminate={onTerminate}
      hitSlop={slop}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: held }}
      style={
        bare
          ? style
          : [
              styles.button,
              { width: size, height: size, borderRadius: r },
              corners,
              flat && (edge === 'end' ? styles.flatEnd : styles.flat),
              disabled && styles.disabled,
              held && styles.held,
              style,
            ]
      }
    >
      {!bare && (
        <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" pointerEvents="none">
          <Path d={PATHS[glyph]} stroke={held ? '#000' : mono.text} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(232,232,232,0.35)',
  },
  flat: { borderWidth: 0, borderRadius: 0, backgroundColor: 'rgba(255,255,255,0.035)' },
  flatEnd: {
    borderWidth: 0,
    borderRadius: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  disabled: { opacity: 0.35 },
  held: {
    backgroundColor: mono.red,
    borderColor: mono.red,
    shadowColor: mono.red,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
