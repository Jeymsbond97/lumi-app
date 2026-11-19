// The Drive screen (docs/DRIVE.md): Lumi's whole body by hand, seen through its own eyes.
// The head camera fills the screen; the torso camera is small on the right (top centre on a phone), tap it to swap
// them. The joystick drives the base as on Home. Bottom centre a panel with two pages:
// BODY: hold to move the lift, the waist, the head left and right and its tilt.
// ARM: hold to turn one joint at a time or move the hand in a straight line (JOINTS / HAND), open and close the
// gripper, move the arm to a taught pose, save where it is as a pose (and delete saved ones), stop the arm.
// Each page shows its part's state (tap it to enable, asked first), the live values and a speed slider: the body's
// is the app's own, the arm's is the robot's global arm speed that every arm motion follows (lib/speed).
// Holding stops on release, on a second finger, on leaving the screen, in the background, on STOP and on a failure.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BusyError, bodyPoseKnown, ARM_TEXT } from '../../lib/api';
import {
  armStop,
  closeGripper,
  deletePose,
  getGripper,
  getPoseNames,
  getSavedPoseNames,
  goPose,
  GRIPPER_TEXT,
  nextPoseName,
  openGripper,
  POSE_TEXT,
  teachPose,
  validPoseName,
  type GripperState,
} from '../../lib/arm';
import { fill, reasonKey } from '../../lib/commands';
import type { CameraName } from '../../lib/camera';
import { driveLayout } from '../../lib/driveLayout';
import { useI18n, type TextKey } from '../../lib/i18n';
import {
  ARM_AXES,
  ARM_JOG_SPEED,
  SPEEDS,
  type ArmAxis,
  type BodyAxis,
  type JogCommand,
  type SpeedName,
  type TcpAxis,
} from '../../lib/jog';
import { useRobot } from '../../lib/robot';
import { CameraFeed } from '../../ui/CameraFeed';
import { ConfirmDialog, type ConfirmRequest } from '../../ui/ConfirmDialog';
import { NameDialog } from '../../ui/NameDialog';
import { HoldButton, type Glyph } from '../../ui/HoldButton';
import { Joystick } from '../../ui/Joystick';
import { SpeedSlider } from '../../ui/SpeedSlider';
import { ARM_DOT, BODY_DOT, Chip } from '../../ui/StatusHud';
import { BODY_TEXT, type BodyState, usePowerSwitch } from '../../ui/usePowerSwitch';
import { useArmSpeed, useBodySpeed, type Refusal } from '../../ui/useDriveSpeed';
import { useJogHold, type JogControl } from '../../ui/useJogHold';
import { BODY_SPEED_RANGE, jogSpeedOf } from '../../lib/speed';
import { clamp, fonts, mono } from '../../ui/theme';

const NOTE_MS = 2500;
/** A note with the robot's own reason is longer to read. */
const REASON_MS = 4500;
/** The big picture is what Lumi drives by: twice as many pictures as the small one. */
const BIG_FRAME_MS = 100;
const GRIPPER_EVERY_MS = 2000;

type Page = 'body' | 'arm';
type ArmMode = 'joints' | 'hand';
/** A note: a text of the app, or one that has the robot's words in it. */
type Note = { key: TextKey } | { text: string };
/** What a refusal shows: with the robot's reason, or without one. */
type RefusalText = { why: TextKey; plain: TextKey };
/** The pose name dialog: where it starts and what saving does. */
interface NameRequest {
  initial: string;
  onDone: (name: string) => void;
}
// a robot without /arm/speed keeps the three steps for the arm
const SPEED_NAMES: SpeedName[] = ['slow', 'normal', 'fast'];
const SPEED_TEXT: Record<SpeedName, TextKey> = { slow: 'speedSlow', normal: 'speedNormal', fast: 'speedFast' };
const nextSpeed = (s: SpeedName): SpeedName => SPEED_NAMES[(SPEED_NAMES.indexOf(s) + 1) % SPEED_NAMES.length];

/** One body or hand axis: its name, its value, and the two buttons (the first for direction `first`). */
interface AxisControl<A> {
  axis: A;
  label: TextKey;
  glyphs: [Glyph, Glyph];
  labels: [TextKey, TextKey];
  /** Which way the first button moves: the robot's lift, pitch +1 go up, waist and head yaw +1 go left. */
  first: 1 | -1;
}

const BODY_CONTROLS: AxisControl<BodyAxis>[] = [
  { axis: 'lift', label: 'lift', glyphs: ['down', 'up'], labels: ['driveLiftDown', 'driveLiftUp'], first: -1 },
  { axis: 'waist', label: 'waist', glyphs: ['left', 'right'], labels: ['driveWaistLeft', 'driveWaistRight'], first: 1 },
  { axis: 'head_yaw', label: 'head', glyphs: ['left', 'right'], labels: ['driveHeadLeft', 'driveHeadRight'], first: 1 },
  { axis: 'head_pitch', label: 'drivePitch', glyphs: ['down', 'up'], labels: ['driveHeadDown', 'driveHeadUp'], first: -1 },
];

// the hand in a straight line, arm base frame: x +1 forward, y +1 left, z +1 up
const TCP_CONTROLS: AxisControl<TcpAxis>[] = [
  { axis: 'tcp_x', label: 'driveTcpX', glyphs: ['down', 'up'], labels: ['driveHandBack', 'driveHandForward'], first: -1 },
  { axis: 'tcp_y', label: 'driveTcpY', glyphs: ['left', 'right'], labels: ['driveHandLeft', 'driveHandRight'], first: 1 },
  { axis: 'tcp_z', label: 'driveTcpZ', glyphs: ['down', 'up'], labels: ['driveHandDown', 'driveHandUp'], first: -1 },
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
  const [legacyArmSpeed, setLegacyArmSpeed] = useState<SpeedName>('slow');
  const [note, setNote] = useState<Note | null>(null);
  const [ask, setAsk] = useState<ConfirmRequest | null>(null);
  const [naming, setNaming] = useState<NameRequest | null>(null);
  const closeAsk = useCallback(() => setAsk(null), []);
  const closeNaming = useCallback(() => setNaming(null), []);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const power = usePowerSwitch();

  const showNote = useCallback((n: Note, ms: number) => {
    setNote(n);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), ms);
  }, []);
  const show = useCallback((key: TextKey) => showNote({ key }, NOTE_MS), [showNote]);
  useEffect(() => () => clearTimeout(noteTimer.current), []);

  /** A refusal: the robot's reason when it gives one (known ones in the app's words), else a plain note. */
  const refusal = useCallback(
    (r: Refusal, texts: RefusalText) => {
      if (r.status === 0) return show('noAnswer');
      if (!r.reason) return show(texts.plain);
      const known = reasonKey(r.reason);
      showNote({ text: fill(t(texts.why), { reason: known ? t(known) : r.reason }) }, REASON_MS);
    },
    [show, showNote, t],
  );

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

  const bodySpeed = useBodySpeed();
  const armSpeedRefused = useCallback((r: Refusal) => refusal(r, { why: 'armSpeedRefused', plain: 'armSpeedFailed' }), [refusal]);
  const armSpeed = useArmSpeed(connection.baseUrl, active, armSpeedRefused);
  const armReady = armSpeed.state.kind === 'ready' ? armSpeed.state.speed : null;
  const slider =
    page === 'body'
      ? { value: bodySpeed.percent, range: BODY_SPEED_RANGE, change: bodySpeed.change, release: bodySpeed.save, step: bodySpeed.save }
      : armReady
        ? { value: armReady.percent, range: armReady, change: armSpeed.change, release: armSpeed.release, step: armSpeed.step }
        : null;

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

      <View
        style={[styles.panel, { bottom: lay.panel.bottom, maxWidth: lay.panel.maxWidth, padding: text * 0.7, gap: text * 0.7 }]}
        pointerEvents="box-none"
      >
        {note && (
          <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} style={styles.noteRow} pointerEvents="none">
            <Text style={[styles.note, { fontSize: text }]}>{'key' in note ? t(note.key) : note.text}</Text>
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
          {slider ? (
            <View style={[styles.slider, { minWidth: text * 20 }]}>
              <SpeedSlider
                value={slider.value}
                range={slider.range}
                size={text}
                height={Math.max(44, lay.button)}
                label={t('driveSpeed')}
                lessLabel={t('driveSpeedLess')}
                moreLabel={t('driveSpeedMore')}
                onChange={slider.change}
                onRelease={slider.release}
                onStep={slider.step}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setLegacyArmSpeed(nextSpeed);
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${t('driveSpeed')} ${t(SPEED_TEXT[legacyArmSpeed])}`}
              style={({ pressed }) => [styles.speed, { height: text * 2.6, paddingHorizontal: text, gap: text * 0.5 }, pressed && styles.pressed]}
            >
              <Text style={[styles.label, { fontSize: text }]}>{t('driveSpeed')}</Text>
              <Text style={[styles.value, { fontSize: text }]}>{t(SPEED_TEXT[legacyArmSpeed])}</Text>
            </Pressable>
          )}
        </View>
        {page === 'body' ? (
          <BodyPage jog={jog} speed={jogSpeedOf(bodySpeed.percent)} button={lay.button} text={text} onNote={show} power={power.body} />
        ) : (
          <ArmPage
            jog={jog}
            speed={armReady ? ARM_JOG_SPEED : SPEEDS[legacyArmSpeed]}
            globalSpeed={armSpeed.state.kind === 'ready'}
            legacy={armSpeed.state.kind === 'old'}
            button={lay.button}
            text={text}
            joints={joints}
            active={active}
            onNote={show}
            onRefused={refusal}
            onAsk={setAsk}
            onName={setNaming}
          />
        )}
      </View>

      <Joystick />
      {power.note && <Text style={[styles.powerNote, { fontSize: text }]}>{t(power.note)}</Text>}
      <ConfirmDialog request={power.ask} onClose={power.closeAsk} />
      <ConfirmDialog request={ask} onClose={closeAsk} />
      <NameDialog
        open={!!naming}
        title="armSaveTitle"
        rule="armPoseNameRule"
        initial={naming?.initial ?? ''}
        valid={validPoseName}
        onDone={(name) => {
          setNaming(null);
          naming?.onDone(name);
        }}
        onClose={closeNaming}
      />
    </View>
  );
}

function BodyPage({ jog: j, speed: v, button, text: size, onNote, power }: PageProps & { power: BodyState }) {
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
  return <AxisButtons controls={BODY_CONTROLS} values={values} jog={j} speed={v} button={button} size={size} ready={ready} why={why} />;
}

/** Each axis' name and value over its two hold buttons. */
function AxisButtons<A extends BodyAxis | TcpAxis>({
  controls,
  values,
  jog,
  speed,
  button,
  size,
  ready,
  why,
}: {
  controls: AxisControl<A>[];
  values?: Record<A, string | null>;
  jog: JogControl;
  speed: number;
  button: number;
  size: number;
  ready: boolean;
  why: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.row, { gap: size * 0.8 }]}>
      {controls.map((c) => (
        <View key={c.axis} style={{ gap: size * 0.35 }}>
          <Reading label={t(c.label)} value={values?.[c.axis] ?? null} size={size} />
          <View style={[styles.row, { gap: size * 0.45 }]}>
            {([c.first, -c.first as 1 | -1] as const).map((direction, i) => (
              <HoldButton
                key={direction}
                cmd={{ axis: c.axis, direction, speed }}
                jog={jog}
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
  globalSpeed,
  legacy,
  button,
  text,
  joints,
  active,
  onNote,
  onRefused,
  onAsk,
  onName,
}: PageProps & {
  /** The robot has the global arm speed (and the hand's straight moves with it). */
  globalSpeed: boolean;
  /** The robot's API is older than /arm/speed: poses go slowly as before. */
  legacy: boolean;
  joints: number[] | null;
  active: boolean;
  onRefused: (r: Refusal, texts: RefusalText) => void;
  onAsk: (r: ConfirmRequest | null) => void;
  onName: (r: NameRequest) => void;
}) {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  const [mode, setMode] = useState<ArmMode>('joints');
  const [joint, setJoint] = useState<ArmAxis>('j1');
  const [gripper, setGripper] = useState<GripperState | null>(null);
  const [gripBusy, setGripBusy] = useState(false);
  const [poses, setPoses] = useState<string[] | null>(null);
  /** The poses people saved, which can be deleted; null: the robot cannot say. */
  const [saved, setSaved] = useState<string[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [posing, setPosing] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const loadPoses = () => {
    getPoseNames(url).then(setPoses, () => setPoses((p) => p ?? []));
    getSavedPoseNames(url).then(setSaved, () => setSaved(null));
  };

  const openPicker = () => {
    if (posing) return;
    if (!enabled) return why();
    Haptics.selectionAsync().catch(() => {});
    jog.release();
    setPicking(true);
    loadPoses();
  };

  const poseName = (n: string) => (POSE_TEXT[n] ? t(POSE_TEXT[n]) : n);

  const savePose = () => {
    if (saving) return;
    if (!powered) return why();
    Haptics.selectionAsync().catch(() => {});
    jog.release();
    onName({
      initial: nextPoseName(poses ?? []),
      onDone: (name) => {
        setSaving(true);
        teachPose(url, name)
          .then((r) => {
            if (!r.ok) return onRefused(r, { why: 'armSaveRefused', plain: 'armSaveFailed' });
            onNote('armPoseSaved');
            loadPoses();
          })
          .finally(() => setSaving(false));
      },
    });
  };

  const removePose = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    onAsk({
      title: fill(t('armPoseDeleteAsk'), { pose: name }),
      choices: [
        {
          text: t('delete'),
          destructive: true,
          onPress: () =>
            deletePose(url, name).then((r) => {
              if (!r.ok) return onRefused(r, { why: 'armDeleteRefused', plain: 'armDeleteFailed' });
              onNote('armPoseDeleted');
              loadPoses();
            }),
        },
      ],
    });
  };
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
            goPose(url, name, legacy)
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
          {poses?.map((n) =>
            saved?.includes(n) ? (
              <View key={n} style={[styles.row, { gap: text * 0.25 }]}>
                <TextButton text={poseName(n)} size={text} onPress={() => pickPose(n)} />
                <DeleteButton size={text * 2.6} label={fill(t('armPoseDeleteLabel'), { pose: n })} onPress={() => removePose(n)} />
              </View>
            ) : (
              <TextButton key={n} text={poseName(n)} size={text} onPress={() => pickPose(n)} />
            ),
          )}
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
  const hand = globalSpeed && mode === 'hand';
  return (
    <View style={{ gap: text * 0.6 }}>
      <View style={[styles.row, styles.wrap, { gap: text * 0.8 }]}>
        {globalSpeed && (
          <Segment
            items={(['joints', 'hand'] as const).map((m) => ({ id: m, text: t(m === 'joints' ? 'driveJoints' : 'driveHand') }))}
            value={mode}
            onChange={(m) => {
              jog.release();
              setMode(m);
            }}
            size={text}
          />
        )}
        {hand ? (
          <AxisButtons controls={TCP_CONTROLS} jog={jog} speed={speed} button={button} size={text} ready={enabled} why={why} />
        ) : (
          <>
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
          </>
        )}
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
        <TextButton text={t('armSave')} size={text} onPress={savePose} dim={!powered} busy={saving} />
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

/** The small delete control on a saved pose. */
function DeleteButton({ size, label, onPress }: { size: number; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.delete, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}
    >
      <Svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" pointerEvents="none">
        <Path d="M7 7 L17 17 M17 7 L7 17" stroke={mono.red} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      </Svg>
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
  slider: { flexGrow: 1, flexShrink: 1 },
  delete: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: mono.red,
    backgroundColor: 'rgba(255,45,45,0.12)',
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
