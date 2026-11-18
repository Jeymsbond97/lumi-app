// A hold-to-move button (style D): the part moves while a finger is on it and stops when it lifts. A second finger
// anywhere stops it too (React Native gives that finger to this button, even one on STOP). A button that cannot
// move its part now (disabled) takes the touch only to say why.
import { useEffect, useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import type { JogCommand } from '../lib/jog';
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
}: {
  cmd: JogCommand;
  jog: JogControl;
  glyph: Glyph;
  size: number;
  label: string;
  disabled?: boolean;
  onDisabledPress?: () => void;
}) {
  const held = sameJog(jog.held, cmd);

  // a held button that goes away (another page) or can no longer move its part stops it: no touch end would come
  const heldRef = useRef(held);
  const releaseRef = useRef(jog.release);
  useEffect(() => {
    heldRef.current = held;
    releaseRef.current = jog.release;
  }, [held, jog.release]);
  useEffect(() => {
    if (disabled && heldRef.current) releaseRef.current();
  }, [disabled]);
  useEffect(
    () => () => {
      if (heldRef.current) releaseRef.current();
    },
    [],
  );

  const onGrant = (e: GestureResponderEvent) => {
    if (disabled) {
      onDisabledPress?.();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    jog.press(cmd, e.nativeEvent.touches.length);
  };
  const onExtraFinger = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length > 1) jog.release();
  };

  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => false}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderStart={onExtraFinger}
      onResponderRelease={jog.release}
      onResponderTerminate={jog.release}
      hitSlop={4}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: held }}
      style={[styles.button, { width: size, height: size, borderRadius: size * 0.28 }, disabled && styles.disabled, held && styles.held]}
    >
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" pointerEvents="none">
        <Path d={PATHS[glyph]} stroke={held ? '#000' : mono.text} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
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
