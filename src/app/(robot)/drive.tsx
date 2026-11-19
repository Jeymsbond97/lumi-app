// The Drive screen (docs/DRIVE.md): Lumi's body by hand, seen through its own eyes.
// The head camera fills the screen; the torso camera is small on the right (top centre on a phone), tap it to swap
// them. The joystick drives the base as on Home. The body controls are hidden at first: the settings button bottom
// centre over the dock opens them (closed each time the screen is entered) as a dark glass card that grows out of the button like a
// genie and shrinks back into it: L(ift), W(aist), H(ead) and T(ilt) with their values, hold to move, over the app's
// own body speed (lib/speed). A tap anywhere outside the card closes it; the button shows only while it is closed.
// The body's state chip is the shared one on top. The arm is set up on Commands, ARM SETUP (ui/ArmSetupPanel).
// Holding stops on release, on a second finger, on leaving the screen, in the background, on STOP and on a failure.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { bodyPoseKnown } from '../../lib/api';
import type { CameraName } from '../../lib/camera';
import { driveLayout, driveText, genieStart, type BodyCard } from '../../lib/driveLayout';
import { useI18n, type TextKey } from '../../lib/i18n';
import type { BodyAxis } from '../../lib/jog';
import { useRobot } from '../../lib/robot';
import { CameraFeed } from '../../ui/CameraFeed';
import { HoldButton, type Glyph } from '../../ui/HoldButton';
import { Joystick } from '../../ui/Joystick';
import { SpeedSlider } from '../../ui/SpeedSlider';
import { bodyState, type BodyState } from '../../ui/usePowerSwitch';
import { useBodySpeed } from '../../ui/useDriveSpeed';
import { useJogHold, type JogControl } from '../../ui/useJogHold';
import { BODY_SPEED_RANGE, jogSpeedOf } from '../../lib/speed';
import { clamp, fonts, mono } from '../../ui/theme';

const NOTE_MS = 2500;
/** Opening: a soft spring with a little overshoot (about 300 ms); closing: back into the button. */
const OPEN_SPRING = { damping: 16, stiffness: 190, mass: 0.9 };
const CLOSE_MS = 240;
/** The big picture is what Lumi drives by: twice as many pictures as the small one. */
const BIG_FRAME_MS = 100;

/** One body axis: its names, and its two joined buttons, left then right, with the direction each moves it. */
interface AxisControl {
  axis: BodyAxis;
  /** The full name, said by screen readers. */
  label: TextKey;
  /** The one letter shown. */
  short: TextKey;
  glyphs: [Glyph, Glyph];
  labels: [TextKey, TextKey];
  /** The robot's lift, pitch +1 go up, waist and head yaw +1 go left. */
  directions: [1 | -1, 1 | -1];
}

const BODY_CONTROLS: AxisControl[] = [
  { axis: 'lift', label: 'lift', short: 'driveLiftShort', glyphs: ['down', 'up'], labels: ['driveLiftDown', 'driveLiftUp'], directions: [-1, 1] },
  { axis: 'waist', label: 'waist', short: 'driveWaistShort', glyphs: ['left', 'right'], labels: ['driveWaistLeft', 'driveWaistRight'], directions: [1, -1] },
  { axis: 'head_yaw', label: 'head', short: 'driveHeadShort', glyphs: ['left', 'right'], labels: ['driveHeadLeft', 'driveHeadRight'], directions: [1, -1] },
  { axis: 'head_pitch', label: 'drivePitch', short: 'drivePitchShort', glyphs: ['down', 'up'], labels: ['driveHeadDown', 'driveHeadUp'], directions: [-1, 1] },
];

export default function Drive() {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [big, setBig] = useState<CameraName>('head');
  /** open: what was asked; shown: the card is on screen (it stays while it shrinks back into the button). */
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const grow = useSharedValue(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [note, setNote] = useState<TextKey | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((key: TextKey) => {
    setNote(key);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(noteTimer.current);
      clearTimeout(closeTimer.current);
    },
    [],
  );

  const jog = useJogHold(show);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const setCard = useCallback(
    (next: boolean) => {
      clearTimeout(closeTimer.current);
      setOpen(next);
      if (next) {
        setShown(true);
        grow.set(withSpring(1, OPEN_SPRING));
      } else {
        grow.set(withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }));
        closeTimer.current = setTimeout(() => setShown(false), CLOSE_MS + 10);
      }
    },
    [grow],
  );

  // the screen stays alive in the tabs: leaving it closes the card, so it is closed whenever the screen is entered
  useFocusEffect(
    useCallback(
      () => () => {
        clearTimeout(closeTimer.current);
        grow.set(0);
        setOpen(false);
        setShown(false);
      },
      [grow],
    ),
  );

  const toggle = (next: boolean) => {
    if (next === open) return;
    Haptics.selectionAsync().catch(() => {});
    if (!next) jog.release();
    setCard(next);
  };

  const lay = driveLayout({
    width,
    height,
    insetTop: inset.top,
    insetRight: inset.right,
    insetBottom: inset.bottom,
    insetLeft: inset.left,
  });
  const label = clamp(9, 0.016 * height, 12);
  const text = driveText(height);
  const active = focused && foreground;
  const small: CameraName = big === 'head' ? 'torso' : 'head';
  const card = lay.body;
  // the genie: the card grows out of the settings button (its centre, its size) and shrinks back into it
  const from = genieStart(card, lay.toggle);
  const genie = useAnimatedStyle(() => {
    const k = grow.get();
    const lag = Math.min(1, Math.max(0, k)) ** 2; // the height follows the width a little later
    return {
      opacity: Math.min(1, Math.max(0, k * 2.2)),
      transform: [{ translateY: from.dy * (1 - k) }, { scaleX: from.sx + (1 - from.sx) * k }, { scaleY: from.sy + (1 - from.sy) * (k < 1 ? lag : k) }],
    };
  });

  const bodySpeed = useBodySpeed();

  const swap = () => {
    Haptics.selectionAsync().catch(() => {});
    setBig(small);
  };

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <CameraFeed key={`big-${big}`} name={big} baseUrl={connection.baseUrl} width={width} height={height} active={active} label={text} bare hd frameMs={BIG_FRAME_MS} />
      </View>

      <Pressable
        onPress={swap}
        accessibilityRole="button"
        accessibilityLabel={t('driveCameraSwap')}
        style={({ pressed }) => [styles.pip, { top: lay.pip.top, left: lay.pip.left }, pressed && styles.pressed]}
      >
        <CameraFeed key={`small-${small}`} name={small} baseUrl={connection.baseUrl} width={lay.pip.width} height={lay.pip.height} active={active} label={label} />
      </Pressable>

      {/* a tap anywhere outside the card closes it */}
      {open && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => toggle(false)} accessibilityRole="button" accessibilityLabel={t('driveBodyHide')} />
      )}

      {shown && (
        <Animated.View
          style={[styles.card, { bottom: card.bottom, left: (width - card.width) / 2, width: card.width, height: card.height }, genie]}
          pointerEvents={open ? 'auto' : 'none'}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.025)', 'rgba(255,255,255,0)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.sheen} pointerEvents="none" />
          <View style={{ padding: card.pad, gap: card.gap }}>
            <BodyAxes jog={jog} speed={jogSpeedOf(bodySpeed.percent)} card={card} size={text} onNote={show} power={bodyState(status?.body ?? null)} />
            <View style={[styles.module, styles.speedRow, { height: card.button, paddingLeft: text * 0.9, paddingRight: text * 0.6 }]}>
              <SpeedSlider
                value={bodySpeed.percent}
                range={BODY_SPEED_RANGE}
                size={text}
                height={card.button}
                light
                label={t('driveSpeed')}
                lessLabel={t('driveSpeedLess')}
                moreLabel={t('driveSpeedMore')}
                onChange={bodySpeed.change}
                onRelease={bodySpeed.save}
                onStep={bodySpeed.save}
              />
            </View>
          </View>
        </Animated.View>
      )}
      {shown && note && (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(200)}
          style={[styles.noteRow, { bottom: card.bottom + card.height + 8 }]}
          pointerEvents="none"
        >
          <Text style={[styles.note, { fontSize: text }]}>{t(note)}</Text>
        </Animated.View>
      )}

      {!shown && (
        <Animated.View
          entering={FadeIn.duration(160)}
          style={[styles.toggle, { bottom: lay.toggle.bottom, left: (width - lay.toggle.size) / 2 }]}
        >
          <ToggleButton size={lay.toggle.size} onPress={() => toggle(true)} label={t('driveBodyShow')} />
        </Animated.View>
      )}

      <Joystick />
    </View>
  );
}

/** The settings button: a gear in a glass ring. */
function ToggleButton({ size, onPress, label }: { size: number; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: false }}
      style={({ pressed }) => [styles.gear, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}
    >
      <GearIcon size={size * 0.5} color={mono.text} />
    </Pressable>
  );
}

// eight square teeth around a ring, on a 24 grid
const GEAR_PATH = (() => {
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    for (const [r, da] of [
      [7.2, -0.36],
      [10, -0.2],
      [10, 0.2],
      [7.2, 0.36],
    ] as const) {
      points.push(`${(12 + r * Math.cos(a + da)).toFixed(2)} ${(12 + r * Math.sin(a + da)).toFixed(2)}`);
    }
  }
  return `M${points.join(' L')} Z`;
})();

function GearIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Path d={GEAR_PATH} stroke={color} strokeWidth={1.8} strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

function BodyAxes({
  jog,
  speed,
  card,
  size,
  onNote,
  power,
}: {
  jog: JogControl;
  speed: number;
  card: BodyCard;
  size: number;
  onNote: (n: TextKey) => void;
  power: BodyState;
}) {
  const { t } = useI18n();
  const { status } = useRobot();
  const body = status?.body ?? null;
  const known = bodyPoseKnown(body) ? body : null;
  const values: Record<BodyAxis, string | null> = {
    lift: known ? `${Math.round(known.liftMm)} mm` : null,
    waist: known ? `${Math.round(known.waistDeg)}°` : null,
    head_yaw: known ? `${Math.round(known.headYawDeg)}°` : null,
    head_pitch: known ? `${Math.round(known.headPitchDeg)}°` : null,
  };
  const ready = power === 'enabled' || power === 'on';
  const why = () => onNote(power === 'off' ? 'bodyOff' : 'driveEnableBodyFirst');
  // each axis its letter and value over its two joined buttons, in a small glass module
  return (
    <View style={[styles.row, { gap: card.gap }]}>
      {BODY_CONTROLS.map((c) => {
        const value = values[c.axis];
        return (
          <View key={c.axis} style={styles.module}>
            <View
              style={[styles.reading, { height: card.label, paddingHorizontal: size * 0.7 }]}
              accessible
              accessibilityLabel={value === null ? t(c.label) : `${t(c.label)} ${value}`}
            >
              <Text style={[styles.letter, { fontSize: size * 0.9 }]}>{t(c.short)}</Text>
              {value !== null && (
                <Text style={[styles.value, { fontSize: size * 1.02 }]} numberOfLines={1}>
                  {value}
                </Text>
              )}
            </View>
            <View style={styles.row}>
              {c.directions.map((direction, i) => (
                <HoldButton
                  key={direction}
                  cmd={{ axis: c.axis, direction, speed }}
                  jog={jog}
                  glyph={c.glyphs[i]}
                  label={t(c.labels[i])}
                  size={card.button}
                  slop={card.slop}
                  edge={i === 0 ? 'start' : 'end'}
                  flat
                  disabled={!ready}
                  onDisabledPress={why}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// keeps small words readable over the camera picture
const shadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  pressed: { opacity: 0.6 },
  pip: {
    position: 'absolute',
    borderRadius: 12,
    padding: 3,
    backgroundColor: 'rgba(8,8,8,0.85)',
    borderWidth: 1,
    borderColor: '#333',
  },
  // dark glass over the live picture: a fine light edge, a soft sheen at the top, a deep shadow under it
  card: {
    position: 'absolute',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(12,14,18,0.68)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  sheen: { position: 'absolute', top: 0, left: 22, right: 22, height: 1, backgroundColor: 'rgba(255,255,255,0.28)' },
  module: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    overflow: 'hidden',
  },
  speedRow: { justifyContent: 'center' },
  toggle: { position: 'absolute' },
  gear: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(12,14,18,0.7)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  reading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  letter: { fontFamily: fonts.monoBold, color: mono.soft, letterSpacing: 1 },
  value: { fontFamily: fonts.monoBold, color: '#ffffff', paddingHorizontal: 4, ...shadow },
  noteRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  note: {
    fontFamily: fonts.mono,
    color: mono.yellow,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
});
