// Lumi's cameras on every section (Home, Map and the ones to come): a small camera button on the right edge, halfway
// down. Tapped, it opens a panel against the right edge with the head camera over the torso camera, between the
// battery and the joystick and clear of the middle (on a phone on its side, left of the joystick down to the dock,
// where the pictures can be bigger); the cross on it closes it back to the button. It stays open across sections.
// Each camera's newest picture is asked for about 5 times a second, only while the panel is open and the app is in
// the foreground. Two pictures take turns: the next one loads hidden behind the shown
// one, so a picture never blanks while the next is on its way.
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet } from 'react-native';
import { useSteadyWindow } from '../lib/steadyWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { cameraLayout } from '../lib/camera';
import { setCameraOpen } from '../lib/cameraOpen';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { CameraFeed } from './CameraFeed';
import { clamp, mono } from './theme';

function CameraIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="M4 7.5h3.2L8.8 5h6.4l1.6 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z" />
      <Circle cx={12} cy={13} r={3.6} />
    </Svg>
  );
}

/** Drawn like the map's cross (the ✕ glyph differs from font to font). */
function Cross({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function CameraPanel() {
  const { t } = useI18n();
  const { connection } = useRobot();
  const { width, height } = useSteadyWindow();
  const inset = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const lay = cameraLayout({ width, height, insetTop: inset.top, insetRight: inset.right, insetBottom: inset.bottom });
  const label = clamp(9, 0.016 * height, 12);
  const active = open && foreground;
  const toggle = (o: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(o);
  };
  // the layout hides the readings and the task card under the panel while it shows
  useEffect(() => {
    setCameraOpen(open);
    return () => setCameraOpen(false);
  }, [open]);

  if (!open) {
    return (
      <Animated.View
        key="button"
        entering={FadeIn.duration(180)}
        style={[
          styles.tab,
          { top: lay.buttonTop, width: lay.buttonWidth + inset.right, height: lay.buttonHeight, paddingRight: inset.right },
        ]}
      >
        <Pressable
          onPress={() => toggle(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('cameraOpen')}
          style={({ pressed }) => [styles.tabPress, pressed && styles.pressed]}
        >
          <CameraIcon size={lay.buttonHeight * 0.45} color={mono.text} />
        </Pressable>
      </Animated.View>
    );
  }

  const close = clamp(26, label * 2.6, 32);
  return (
    <Animated.View
      key="panel"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={[
        styles.panel,
        { top: lay.top, padding: lay.pad, gap: lay.pad },
        lay.right > 0 ? [styles.panelFree, { right: lay.right }] : { paddingRight: lay.pad + inset.right },
      ]}
    >
      {(['head', 'torso'] as const).map((name) => (
        <CameraFeed
          key={name}
          name={name}
          baseUrl={connection.baseUrl}
          width={lay.pictureWidth}
          height={lay.pictureHeight}
          active={active}
          label={label}
        />
      ))}
      <Pressable
        onPress={() => toggle(false)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('cameraClose')}
        style={({ pressed }) => [
          styles.close,
          {
            top: lay.pad + 6,
            right: lay.pad + (lay.right > 0 ? 0 : inset.right) + 6,
            width: close,
            height: close,
            borderRadius: close / 2,
          },
          pressed && styles.pressed,
        ]}
      >
        <Cross size={close * 0.42} color={mono.text} />
      </Pressable>
    </Animated.View>
  );
}

const glass = { backgroundColor: 'rgba(8,8,8,0.92)', borderColor: '#333', borderWidth: 1, borderRightWidth: 0 };

const styles = StyleSheet.create({
  tab: { position: 'absolute', right: 0, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, ...glass },
  tabPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', right: 0, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, ...glass },
  // on a phone the panel sits left of the joystick, away from the edge: round and framed on every side
  panelFree: { borderRadius: 16, borderRightWidth: 1 },
  close: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(232,232,232,0.2)',
  },
  pressed: { opacity: 0.6 },
});
