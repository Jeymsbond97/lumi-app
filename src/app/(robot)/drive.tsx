// The Drive screen (docs/DRIVE.md): Lumi's whole body by hand, seen through its own eyes.
// The head camera fills the screen; the torso camera is small on the right (top centre on a phone), tap it to swap
// them. The joystick drives the base as on Home. Bottom centre a panel with two pages:
// BODY: hold to move the lift, the waist, the head left and right and its tilt.
// ARM: hold to turn one joint at a time, open and close the gripper, move the arm to a taught pose, stop the arm.
// Each page shows its part's state (tap it to enable, asked first), the live values and a speed for its buttons.
// Holding stops on release, on a second finger, on leaving the screen, in the background, on STOP and on a failure.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BusyError, bodyPoseKnown, ARM_TEXT } from '../../lib/api';
import {
  armStop,
  closeGripper,
  getGripper,
  getPoseNames,
  goPose,
  GRIPPER_TEXT,
  openGripper,
  POSE_TEXT,
  type GripperState,
} from '../../lib/arm';
import type { CameraName } from '../../lib/camera';
import { driveLayout } from '../../lib/driveLayout';
import { useI18n, type TextKey } from '../../lib/i18n';
import { ARM_AXES, SPEEDS, type ArmAxis, type BodyAxis, type JogCommand, type SpeedName } from '../../lib/jog';
import { useRobot } from '../../lib/robot';
import { CameraFeed } from '../../ui/CameraFeed';
import { ConfirmDialog, type ConfirmRequest } from '../../ui/ConfirmDialog';
import { HoldButton, type Glyph } from '../../ui/HoldButton';
import { Joystick } from '../../ui/Joystick';
import { ARM_DOT, BODY_DOT, Chip } from '../../ui/StatusHud';
import { BODY_TEXT, type BodyState, usePowerSwitch } from '../../ui/usePowerSwitch';
import { useJogHold, type JogControl } from '../../ui/useJogHold';
import { clamp, fonts, mono } from '../../ui/theme';

const NOTE_MS = 2500;
/** The big picture is what Lumi drives by: twice as many pictures as the small one. */
const BIG_FRAME_MS = 100;
const GRIPPER_EVERY_MS = 2000;

type Page = 'body' | 'arm';
const SPEED_NAMES: SpeedName[] = ['slow', 'normal', 'fast'];
const SPEED_TEXT: Record<SpeedName, TextKey> = { slow: 'speedSlow', normal: 'speedNormal', fast: 'speedFast' };
const nextSpeed = (s: SpeedName): SpeedName => SPEED_NAMES[(SPEED_NAMES.indexOf(s) + 1) % SPEED_NAMES.length];

/** One body axis: its name, its value, and the two buttons (the first for direction -1). */
interface BodyControl {
  axis: BodyAxis;
  label: TextKey;
  glyphs: [Glyph, Glyph];
  labels: [TextKey, TextKey];
  /** Which way the first button moves: the robot's lift, pitch +1 go up, waist and head yaw +1 go left. */
  first: 1 | -1;
}

const BODY_CONTROLS: BodyControl[] = [
  { axis: 'lift', label: 'lift', glyphs: ['down', 'up'], labels: ['driveLiftDown', 'driveLiftUp'], first: -1 },
  { axis: 'waist', label: 'waist', glyphs: ['left', 'right'], labels: ['driveWaistLeft', 'driveWaistRight'], first: 1 },
  { axis: 'head_yaw', label: 'head', glyphs: ['left', 'right'], labels: ['driveHeadLeft', 'driveHeadRight'], first: 1 },
  { axis: 'head_pitch', label: 'drivePitch', glyphs: ['down', 'up'], labels: ['driveHeadDown', 'driveHeadUp'], first: -1 },
];

export default function Drive() {
  const { t } = useI18n();
  const { connection, joints } = useRobot();
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [big, setBig] = useState<CameraName>('head');
  const [page, setPage] = useState<Page>('body');
  const [speed, setSpeed] = useState<Record<Page, SpeedName>>({ body: 'normal', arm: 'slow' });
  const [note, setNote] = useState<TextKey | null>(null);
  const [ask, setAsk] = useState<ConfirmRequest | null>(null);
  const closeAsk = useCallback(() => setAsk(null), []);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const power = usePowerSwitch();

  const show = useCallback((n: TextKey) => {
    setNote(n);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);
  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const jog = useJogHold(show);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const lay = driveLayout({
    width,
    height,
    insetTop: inset.top,
    insetRight: inset.right,
    insetBottom: inset.bottom,
    insetLeft: inset.left,
  });
  const label = clamp(9, 0.016 * height, 12);
  const text = clamp(10, 0.018 * height, 14);
  const active = focused && foreground;
  const small: CameraName = big === 'head' ? 'torso' : 'head';

  const swap = () => {
    Haptics.selectionAsync().catch(() => {});
    setBig(small);
  };

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <CameraFeed key={`big-${big}`} name={big} baseUrl={connection.baseUrl} width={width} height={height} active={active} label={text} bare frameMs={BIG_FRAME_MS} />
      </View>

      <Pressable
        onPress={swap}
        accessibilityRole="button"
        accessibilityLabel={t('driveCameraSwap')}
        style={({ pressed }) => [styles.pip, { top: lay.pip.top, left: lay.pip.left }, pressed && styles.pressed]}
      >
        <CameraFeed key={`small-${small}`} name={small} baseUrl={connection.baseUrl} width={lay.pip.width} height={lay.pip.height} active={active} label={label} />
      </Pressable>

      <View
        style={[styles.panel, { bottom: lay.panel.bottom, maxWidth: lay.panel.maxWidth, padding: text * 0.7, gap: text * 0.7 }]}
        pointerEvents="box-none"
      >
        {note && (
          <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} style={styles.noteRow} pointerEvents="none">
            <Text style={[styles.note, { fontSize: text }]}>{t(note)}</Text>
          </Animated.View>
        )}
        <View style={[styles.header, { gap: text * 0.8 }]}>
          <Segment
            items={(['body', 'arm'] as const).map((p) => ({ id: p, text: t(p === 'body' ? 'driveBody' : 'driveArm') }))}
            value={page}
            onChange={(p) => {
              jog.release();
              setPage(p);
            }}
            size={text}
          />
          <Pressable
            onPress={page === 'body' ? power.switchBody : power.switchArm}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ busy: page === 'body' ? power.busyBody : power.busyArm }}
            style={({ pressed }) => pressed && styles.pressed}
          >
            {page === 'body' ? (
              <Chip on={power.body !== 'off'} colour={BODY_DOT[power.body]} text={t(BODY_TEXT[power.body])} size={text} busy={power.busyBody} />
            ) : (
              <Chip on={power.arm !== 'off'} colour={ARM_DOT[power.arm]} text={t(ARM_TEXT[power.arm])} size={text} busy={power.busyArm} />
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSpeed((v) => ({ ...v, [page]: nextSpeed(v[page]) }));
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${t('driveSpeed')} ${t(SPEED_TEXT[speed[page]])}`}
            style={({ pressed }) => [styles.speed, { height: text * 2.6, paddingHorizontal: text, gap: text * 0.5 }, pressed && styles.pressed]}
          >
            <Text style={[styles.label, { fontSize: text }]}>{t('driveSpeed')}</Text>
            <Text style={[styles.value, { fontSize: text }]}>{t(SPEED_TEXT[speed[page]])}</Text>
          </Pressable>
        </View>
        {page === 'body' ? (
          <BodyPage jog={jog} speed={SPEEDS[speed.body]} button={lay.button} text={text} onNote={show} power={power.body} />
        ) : (
          <ArmPage
            jog={jog}
            speed={SPEEDS[speed.arm]}
            button={lay.button}
            text={text}
            joints={joints}
            active={active}
            onNote={show}
            onAsk={setAsk}
          />
        )}
      </View>

      <Joystick />
      {power.note && <Text style={[styles.powerNote, { fontSize: text }]}>{t(power.note)}</Text>}
      <ConfirmDialog request={power.ask} onClose={power.closeAsk} />
      <ConfirmDialog request={ask} onClose={closeAsk} />
    </View>
  );
}

function BodyPage({ jog: j, speed: v, button, text: size, onNote, power }: PageProps & { power: BodyState }) {
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
  return (
    <View style={[styles.row, { gap: size * 0.8 }]}>
      {BODY_CONTROLS.map((c) => (
        <View key={c.axis} style={{ gap: size * 0.35 }}>
          <Reading label={t(c.label)} value={values[c.axis]} size={size} />
          <View style={[styles.row, { gap: size * 0.45 }]}>
            {([c.first, -c.first as 1 | -1] as const).map((direction, i) => (
              <HoldButton
                key={direction}
                cmd={{ axis: c.axis, direction, speed: v }}
                jog={j}
                glyph={c.glyphs[i]}
                label={t(c.labels[i])}
                size={button}
                disabled={!ready}
                onDisabledPress={why}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

interface PageProps {
  jog: JogControl;
  speed: number;
  button: number;
  text: number;
  onNote: (n: TextKey) => void;
}

function ArmPage({
  jog,
  speed,
  button,
  text,
  joints,
  active,
  onNote,
  onAsk,
}: PageProps & { joints: number[] | null; active: boolean; onAsk: (r: ConfirmRequest | null) => void }) {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  const [joint, setJoint] = useState<ArmAxis>('j1');
  const [gripper, setGripper] = useState<GripperState | null>(null);
  const [gripBusy, setGripBusy] = useState(false);
  const [poses, setPoses] = useState<string[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [posing, setPosing] = useState(false);
  const stoppedDuringPose = useRef(false);
  const arm = status?.armState ?? 'off';
  const enabled = arm === 'enabled';
  const powered = arm === 'enabled' || arm === 'disabled';
  const url = connection.baseUrl;

  // the gripper's state while this page shows and the arm has power
  useEffect(() => {
    if (!active || !powered) return;
    let on = true;
    const read = () =>
      getGripper(url)
        .then((g) => on && setGripper(g))
        .catch(() => on && setGripper(null));
    read();
    const id = setInterval(read, GRIPPER_EVERY_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [active, powered, url]);

  const why = () => onNote(powered ? 'driveEnableArmFirst' : 'armOff');

  const grip = (open: boolean) => {
    if (!powered) return why();
    if (gripBusy) return;
    const run = () => {
      setGripBusy(true);
      (open ? openGripper(url) : closeGripper(url))
        .then(() => getGripper(url).then(setGripper, () => {}))
        .catch((e) => onNote(e instanceof BusyError ? 'busy' : 'noAnswer'))
        .finally(() => setGripBusy(false));
    };
    Haptics.selectionAsync().catch(() => {});
    if (!open) onAsk({ title: t('gripperCloseAsk'), choices: [{ text: t('gripperClose'), onPress: run }] });
    else if (gripper === 'holding') onAsk({ title: t('gripperOpenAsk'), choices: [{ text: t('gripperOpen'), destructive: true, onPress: run }] });
    else run();
  };

  const openPicker = () => {
    if (posing) return;
    if (!enabled) return why();
    Haptics.selectionAsync().catch(() => {});
    jog.release();
    setPicking(true);
    getPoseNames(url).then(setPoses, () => setPoses((p) => p ?? []));
  };

  const poseName = (n: string) => (POSE_TEXT[n] ? t(POSE_TEXT[n]) : n);
  const pickPose = (name: string) => {
    setPicking(false);
    onAsk({
      title: t('armPoseAsk').replace('{pose}', poseName(name)),
      choices: [
        {
          text: t('armPoseGo'),
          onPress: () => {
            setPosing(true);
            stoppedDuringPose.current = false;
            goPose(url, name)
              .then(() => onNote('armPoseDone'))
              .catch((e) => {
                // a move stopped with Stop arm comes back refused; the stop has said so already
                if (stoppedDuringPose.current) return;
                onNote(e instanceof Error && /HTTP 4\d\d$/.test(e.message) ? 'armPoseRefused' : 'noAnswer');
              })
              .finally(() => setPosing(false));
          },
        },
      ],
    });
  };

  const stopArm = () => {
    stoppedDuringPose.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    jog.release();
    armStop(url).then(
      () => onNote('armStopped'),
      () => onNote('noAnswer'),
    );
  };

  const stopButton = <TextButton text={t('armStop')} size={text} onPress={stopArm} danger />;

  if (picking) {
    return (
      <View style={{ gap: text * 0.6 }}>
        <View style={[styles.row, styles.wrap, { gap: text * 0.5 }]}>
          {poses === null && <ActivityIndicator size="small" color={mono.text} />}
          {poses?.length === 0 && <Text style={[styles.label, { fontSize: text }]}>{t('armNoPoses')}</Text>}
          {poses?.map((n) => <TextButton key={n} text={poseName(n)} size={text} onPress={() => pickPose(n)} />)}
        </View>
        <View style={[styles.row, { gap: text * 0.5 }]}>
          <TextButton text={t('cancel')} size={text} onPress={() => setPicking(false)} muted />
          {stopButton}
        </View>
      </View>
    );
  }

  const index = ARM_AXES.indexOf(joint);
  const cmd = (direction: 1 | -1): JogCommand => ({ axis: joint, direction, speed });
  return (
    <View style={{ gap: text * 0.6 }}>
      <View style={[styles.row, styles.wrap, { gap: text * 0.8 }]}>
        <View style={[styles.row, { gap: text * 0.3 }]}>
          {ARM_AXES.map((a, i) => {
            const on = a === joint;
            return (
              <Pressable
                key={a}
                onPress={() => {
                  if (a === joint) return;
                  Haptics.selectionAsync().catch(() => {});
                  jog.release();
                  setJoint(a);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.joint,
                  { height: button, minWidth: text * 3.6, paddingHorizontal: text * 0.4, borderRadius: button * 0.28 },
                  on && styles.jointOn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.jointName, { fontSize: text }, on && styles.jointNameOn]}>{`${t('driveJoint')}${i + 1}`}</Text>
                {joints && <Text style={[styles.jointValue, { fontSize: text * 0.85 }, on && styles.jointNameOn]}>{`${Math.round(joints[i])}°`}</Text>}
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.row, { gap: text * 0.45 }]}>
          <HoldButton cmd={cmd(-1)} jog={jog} glyph="minus" label={`${t('driveJoint')}${index + 1} ${t('driveJointLess')}`} size={button} disabled={!enabled} onDisabledPress={why} />
          <HoldButton cmd={cmd(1)} jog={jog} glyph="plus" label={`${t('driveJoint')}${index + 1} ${t('driveJointMore')}`} size={button} disabled={!enabled} onDisabledPress={why} />
        </View>
      </View>
      <View style={[styles.row, styles.wrap, { gap: text * 0.5 }]}>
        <Reading label={t('gripper')} value={gripper ? t(GRIPPER_TEXT[gripper]) : null} size={text} />
        {gripBusy ? (
          <ActivityIndicator size="small" color={mono.text} />
        ) : (
          <>
            <TextButton text={t('gripperOpen')} size={text} onPress={() => grip(true)} dim={!powered} />
            <TextButton text={t('gripperClose')} size={text} onPress={() => grip(false)} dim={!powered} />
          </>
        )}
        <TextButton text={t('armPose')} size={text} onPress={openPicker} dim={!enabled} busy={posing} />
        {stopButton}
      </View>
    </View>
  );
}

function Reading({ label, value, size }: { label: string; value: string | null; size: number }) {
  return (
    <View style={[styles.row, { gap: size * 0.5 }]}>
      <Text style={[styles.label, { fontSize: size }]}>{label}</Text>
      {value !== null && <Text style={[styles.value, { fontSize: size }]}>{value}</Text>}
    </View>
  );
}

function Segment<T extends string>({
  items,
  value,
  onChange,
  size,
}: {
  items: { id: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
  size: number;
}) {
  return (
    <View style={[styles.segment, { padding: 2 }]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(it.id);
            }}
            hitSlop={4}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.segmentItem,
              { paddingHorizontal: size, height: size * 2.3 },
              on && styles.segmentOn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentText, { fontSize: size }, on && styles.segmentTextOn]}>{it.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TextButton({
  text,
  size,
  onPress,
  danger,
  muted,
  dim,
  busy,
}: {
  text: string;
  size: number;
  onPress: () => void;
  danger?: boolean;
  muted?: boolean;
  dim?: boolean;
  busy?: boolean;
}) {
  const colour = danger ? mono.red : muted ? mono.soft : mono.text;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!dim }}
      style={({ pressed }) => [
        styles.textButton,
        { height: size * 2.6, paddingHorizontal: size * 1, borderColor: muted ? mono.dim : colour },
        danger && styles.textButtonDanger,
        dim && styles.dim,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={colour} /> : <Text style={[styles.textButtonText, { fontSize: size, color: colour }]}>{text}</Text>}
    </Pressable>
  );
}

// keeps small words readable over the camera picture
const shadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.35 },
  pip: {
    position: 'absolute',
    borderRadius: 12,
    padding: 3,
    backgroundColor: 'rgba(8,8,8,0.85)',
    borderWidth: 1,
    borderColor: '#333',
  },
  panel: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(232,232,232,0.14)',
    backgroundColor: 'rgba(8,8,8,0.78)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1, textTransform: 'uppercase', ...shadow },
  value: { fontFamily: fonts.monoBold, color: mono.text, ...shadow },
  speed: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: mono.dim,
    backgroundColor: mono.glass,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(232,232,232,0.18)',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  segmentItem: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: mono.text },
  segmentText: { fontFamily: fonts.monoBold, color: mono.soft, letterSpacing: 1.5, textTransform: 'uppercase' },
  segmentTextOn: { color: '#000' },
  joint: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(232,232,232,0.25)',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  jointOn: { borderColor: mono.text, backgroundColor: 'rgba(232,232,232,0.12)' },
  jointName: { fontFamily: fonts.monoBold, color: mono.soft },
  jointNameOn: { color: mono.text },
  jointValue: { fontFamily: fonts.mono, color: mono.soft },
  textButton: { borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  textButtonDanger: { backgroundColor: 'rgba(255,45,45,0.12)' },
  textButtonText: { fontFamily: fonts.monoBold, letterSpacing: 1, textTransform: 'uppercase' },
  noteRow: { position: 'absolute', bottom: '100%', left: 0, right: 0, alignItems: 'center', paddingBottom: 8 },
  note: {
    fontFamily: fonts.mono,
    color: mono.yellow,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
  powerNote: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    fontFamily: fonts.mono,
    color: mono.yellow,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
});
