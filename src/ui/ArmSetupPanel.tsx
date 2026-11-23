// ARM SETUP on the Commands screen (docs/COMMANDS.md): the arm by hand, laid out as Cobo π's Manual page in the
// app's dark look. A slim header (the arm's state chip, asked first; STOP ARM), then
// - a tablet: left, the arm alone in a 3D simulation (ui/LumiScene, the scene's arm view) with the live TCP read-out
//   under it, over the JOINTS / POSES panel (J1 to J6 as quarter rings: hold a half to turn the joint); right, the hand
//   pad (Z capsule, round X Y pad), the gripper and the speed on Cobo π's ticked scale;
// - a phone on its side: the 3D arm left (STOP ARM on its corner; the arm chip is the shared one on top), the controls
//   in tabs (JOINTS, POSES, MOVE) in the middle, the speed fader right (lib/arm armSetupLayout). Where the controls
//   scroll, holds start after a still moment (HoldButton delayed).
// Holding stops on release, on a second finger, on leaving the screen or this group, in the background, on STOP and
// on a failure (ui/useJogHold). How each tap went is told on the Commands status line (onReport).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect } from 'react-native-svg';
import { BusyError, ARM_TEXT } from '../lib/api';
import {
  armPowered,
  armSetupLayout,
  armStop,
  armWhy,
  closeGripper,
  deletePose,
  getArmTcp,
  getGripper,
  getPoseNames,
  getSavedPoseNames,
  goPose,
  GRIPPER_TEXT,
  nextPoseName,
  openGripper,
  POSE_TEXT,
  splitPoses,
  teachPose,
  type GripperState,
} from '../lib/arm';
import { tcpParts, type PadKey, type Tcp } from '../lib/armPad';
import { fill, type Phase } from '../lib/commands';
import { useI18n, type TextKey } from '../lib/i18n';
import { ARM_AXES, ARM_JOG_SPEED, SPEEDS, type SpeedName } from '../lib/jog';
import { useRobot } from '../lib/robot';
import { useLiveJoints } from '../lib/useLiveJoints';
import { armSceneState, type SceneState } from '../scene/sceneState';
import type { ConfirmRequest } from './ConfirmDialog';
import { HandPad, JointArc, TickSlider } from './ArmPads';
import { LumiScene } from './LumiScene';
import { SpeedFader } from './SpeedFader';
import { ARM_DOT, Chip } from './StatusHud';
import { useArmSpeed, type Refusal } from './useDriveSpeed';
import { useJogHold } from './useJogHold';
import type { PowerSwitch } from './usePowerSwitch';
import { fonts, mono } from './theme';

const GRIPPER_EVERY_MS = 2000;
/** The TCP read-out under the 3D arm. */
const TCP_EVERY_MS = 500;

type Tab = 'joints' | 'poses' | 'move';

/** The scene's first state when the robot has not said anything yet: the arm view straight away. */
const ARM_VIEW: SceneState = { view: 'arm', armState: 'off', charging: false };
/** The simulation's grey (web/home3d.html SIM_BG): the 3D card's colour from the first frame, the scene fades in over it. */
const SIM_GREY = '#767b82';
const CARD_RADIUS = 16;

/** How a tap went, for the Commands status line: a text of the app (key) or the robot's own reason. */
export interface ArmReport {
  label: TextKey;
  phase: Phase;
  key?: TextKey;
  reason?: string | null;
}

/** The pose name dialog: where it starts and what saving does. */
export interface NameRequest {
  initial: string;
  onDone: (name: string) => void;
}

// a robot without /arm/speed keeps the three steps for the arm
const SPEED_NAMES: SpeedName[] = ['slow', 'normal', 'fast'];
const SPEED_TEXT: Record<SpeedName, TextKey> = { slow: 'speedSlow', normal: 'speedNormal', fast: 'speedFast' };
const nextSpeed = (s: SpeedName): SpeedName => SPEED_NAMES[(SPEED_NAMES.indexOf(s) + 1) % SPEED_NAMES.length];

// the hand pad's names and what screen readers say: the arm's base frame, x +1 forward, y +1 left, z +1 up
const PAD_NAMES: Record<PadKey | 'zUp' | 'zDown', TextKey> = {
  up: 'padYPlus',
  down: 'padYMinus',
  right: 'padXPlus',
  left: 'padXMinus',
  zUp: 'padZPlus',
  zDown: 'padZMinus',
};
const PAD_LABELS: Record<PadKey | 'zUp' | 'zDown', TextKey> = {
  up: 'driveHandLeft',
  down: 'driveHandRight',
  right: 'driveHandForward',
  left: 'driveHandBack',
  zUp: 'driveHandUp',
  zDown: 'driveHandDown',
};

export function ArmSetupPanel({
  size,
  width,
  power,
  onReport,
  onAsk,
  onName,
}: {
  /** The Commands screen's text size. */
  size: number;
  /** The free width the panel has. */
  width: number;
  power: PowerSwitch;
  onReport: (r: ArmReport) => void;
  onAsk: (r: ConfirmRequest) => void;
  onName: (r: NameRequest) => void;
}) {
  const { t } = useI18n();
  const { connection, status, joints } = useRobot();
  const url = connection.baseUrl;
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [tab, setTab] = useState<Tab>('joints');
  const [tcp, setTcp] = useState<Tcp | null>(null);
  const [legacySpeed, setLegacySpeed] = useState<SpeedName>('slow');
  const [gripper, setGripper] = useState<GripperState | null>(null);
  const [gripBusy, setGripBusy] = useState(false);
  const [poses, setPoses] = useState<string[] | null>(null);
  /** The poses people saved, which can be deleted; null: the robot cannot say. */
  const [saved, setSaved] = useState<string[] | null>(null);
  const [posing, setPosing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stoppedDuringPose = useRef(false);

  const arm = status?.armState ?? 'off';
  const enabled = arm === 'enabled';
  const powered = armPowered(arm);
  const active = focused && foreground;
  // the live arm: its joints 5 times a second while the group shows and the arm has power
  const armOn = !!status && status.armState !== 'off' && !status.armSilent;
  const liveJoints = useLiveJoints(url, active && armOn);
  // the joints once read stay shown (numbers and the 3D arm): the controller's drop-outs, a silent arm round (which
  // also pauses the live reads) only keep the last good ones
  const readJoints = liveJoints ?? joints;
  const [lastJoints, setLastJoints] = useState<number[] | null>(null);
  if (readJoints && readJoints !== lastJoints) setLastJoints(readJoints);
  const shownJoints = readJoints ?? lastJoints;
  const scene = useMemo(() => (status ? armSceneState(status, shownJoints) : null), [status, shownJoints]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  /** A text of the app: no answer is lost, anything else refused. */
  const note = useCallback(
    (label: TextKey, key: TextKey, phase?: Phase) => onReport({ label, key, phase: phase ?? (key === 'noAnswer' ? 'lost' : 'refused') }),
    [onReport],
  );
  /** A refusal: the robot's reason when it gives one, else a plain text. */
  const refused = useCallback(
    (label: TextKey, r: Refusal, plain: TextKey) => {
      if (r.status === 0) return note(label, 'noAnswer');
      if (!r.reason) return note(label, plain);
      onReport({ label, phase: 'refused', reason: r.reason });
    },
    [note, onReport],
  );

  const jogNote = useCallback((key: TextKey) => note('cmdGroupArmSetup', key), [note]);
  const jog = useJogHold(jogNote);

  const speedRefused = useCallback((r: Refusal) => refused('driveSpeed', r, 'armSpeedFailed'), [refused]);
  const armSpeed = useArmSpeed(url, active, speedRefused);
  const speedReady = armSpeed.state.kind === 'ready' ? armSpeed.state.speed : null;
  const legacy = armSpeed.state.kind === 'old';
  const jogSpeed = speedReady ? ARM_JOG_SPEED : SPEEDS[legacySpeed];

  // the gripper's state while this group shows and the arm has power
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

  // the hand's place and turn under the 3D arm, while this group shows and the arm has power
  useEffect(() => {
    if (!active || !powered) return;
    let on = true;
    // the controller drops out for about half a second now and then: a failed read changes nothing, so the last good
    // read-out always stays on this screen
    const show = (v: Tcp | null) => {
      if (on && v) setTcp(v);
    };
    const read = () => getArmTcp(url).then(show, () => {});
    read();
    const id = setInterval(read, TCP_EVERY_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [active, powered, url]);

  const loadPoses = useCallback(() => {
    getPoseNames(url).then(setPoses, () => setPoses((p) => p ?? []));
    getSavedPoseNames(url).then(setSaved, () => setSaved(null));
  }, [url]);

  // the poses each time the group shows
  useEffect(() => {
    if (focused) loadPoses();
  }, [focused, loadPoses]);

  const why = (label: TextKey) => note(label, armWhy(arm));
  const poseName = (n: string) => (POSE_TEXT[n] ? t(POSE_TEXT[n]) : n);

  const grip = (open: boolean) => {
    if (!powered) return why('gripper');
    if (gripBusy) return;
    const run = () => {
      setGripBusy(true);
      (open ? openGripper(url) : closeGripper(url))
        .then(() => getGripper(url).then(setGripper, () => {}))
        .catch((e) => note('gripper', e instanceof BusyError ? 'busy' : 'noAnswer'))
        .finally(() => setGripBusy(false));
    };
    Haptics.selectionAsync().catch(() => {});
    if (!open) onAsk({ title: t('gripperCloseAsk'), choices: [{ text: t('gripperClose'), onPress: run }] });
    else if (gripper === 'holding') onAsk({ title: t('gripperOpenAsk'), choices: [{ text: t('gripperOpen'), destructive: true, onPress: run }] });
    else run();
  };

  const pickPose = (name: string) => {
    if (posing) return;
    if (!enabled) return why('armSetupPoses');
    Haptics.selectionAsync().catch(() => {});
    jog.release();
    onAsk({
      title: fill(t('armPoseAsk'), { pose: poseName(name) }),
      choices: [
        {
          text: t('armPoseGo'),
          onPress: () => {
            setPosing(name);
            stoppedDuringPose.current = false;
            onReport({ label: 'armSetupPoses', phase: 'sending' });
            goPose(url, name, legacy)
              .then((r) => {
                if (r.ok) return note('armSetupPoses', 'armPoseDone', 'done');
                // a move stopped with STOP ARM comes back refused; the stop has said so already
                if (stoppedDuringPose.current) return;
                if (r.status >= 500) return note('armSetupPoses', 'armControllerLost');
                refused('armSetupPoses', r, 'armPoseRefused');
              })
              .finally(() => setPosing(null));
          },
        },
      ],
    });
  };

  const savePose = () => {
    if (saving) return;
    if (!powered) return why('armSave');
    Haptics.selectionAsync().catch(() => {});
    jog.release();
    onName({
      initial: nextPoseName(poses ?? []),
      onDone: (name) => {
        setSaving(true);
        teachPose(url, name)
          .then((r) => {
            if (!r.ok) return refused('armSave', r, 'armSaveFailed');
            note('armSave', 'armPoseSaved', 'done');
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
              if (!r.ok) return refused('delete', r, 'armDeleteFailed');
              note('delete', 'armPoseDeleted', 'done');
              loadPoses();
            }),
        },
      ],
    });
  };

  const stopArm = () => {
    stoppedDuringPose.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    jog.release();
    armStop(url).then(
      () => note('armStop', 'armStopped', 'done'),
      () => note('armStop', 'noAnswer'),
    );
  };

  // ---------- sizes ----------
  const gap = size * 0.6;
  const lay = armSetupLayout(width, size, gap);
  const wide = lay.kind === 'wide';
  const touch = Math.max(44, Math.round(size * 3));
  const [jointArea, setJointArea] = useState({ w: 0, h: 0 });
  const [padArea, setPadArea] = useState({ w: 0, h: 0 });
  const [panelHeight, setPanelHeight] = useState(0);
  const hold = { jog, speed: jogSpeed, enabled, why: () => why('cmdGroupArmSetup'), delayed: !wide };
  // the hand's straight moves need the robot's global arm speed (an older robot API has no tcp axes)
  const handHold = {
    ...hold,
    enabled: enabled && !!speedReady,
    why: () => (enabled ? note('armSetupMove', 'armHandNeedsUpdate') : why('armSetupMove')),
  };

  // ---------- the header ----------
  const chip = (
    <Pressable
      onPress={power.switchArm}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ busy: power.busyArm }}
      style={({ pressed }) => [{ minHeight: touch, justifyContent: 'center' }, pressed && styles.pressed]}
    >
      <Chip on={arm !== 'off'} colour={ARM_DOT[arm]} text={t(ARM_TEXT[arm])} size={size * 0.85} busy={power.busyArm} />
    </Pressable>
  );
  const stopIcon = (
    <Svg width={size * 0.9} height={size * 0.9} viewBox="0 0 24 24" pointerEvents="none">
      <Rect x={5} y={5} width={14} height={14} rx={2.5} fill={mono.red} />
    </Svg>
  );
  const stop = (
    <Pressable
      onPress={stopArm}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={t('armStop')}
      style={({ pressed }) => [styles.stop, styles.row, { height: touch, paddingHorizontal: size * 1.1, gap: size * 0.5 }, pressed && styles.pressed]}
    >
      {stopIcon}
      <Text style={[styles.stopText, { fontSize: size * 0.85 }]} numberOfLines={1}>
        {t('armStop')}
      </Text>
    </Pressable>
  );

  // ---------- the 3D arm and its TCP read-out ----------
  const parts = tcp ? tcpParts(tcp) : null;
  const sim = (
    <View style={[styles.card, styles.sim, wide ? styles.simWide : { width: (lay as { scene: number }).scene }]}>
      <View style={styles.grow}>{focused && <LumiScene state={scene} initial={scene ?? ARM_VIEW} background={SIM_GREY} />}</View>
      {!wide && (
        <Pressable
          onPress={stopArm}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('armStop')}
          style={({ pressed }) => [styles.stop, styles.stopCorner, { width: touch, height: touch }, pressed && styles.pressed]}
        >
          {stopIcon}
        </Pressable>
      )}
      {parts && (
        <View style={[styles.tcp, { paddingHorizontal: Math.max(CARD_RADIUS, size * 0.9), paddingVertical: size * 0.5 }]}>
          {parts.map((p) => (
            <Text key={p.key} style={[styles.tcpPart, { fontSize: size * (wide ? 0.72 : 0.6) }, !wide && styles.tcpThird]} numberOfLines={1}>
              <Text style={styles.tcpName}>{`${t(p.key)} `}</Text>
              {p.value}
            </Text>
          ))}
        </View>
      )}
    </View>
  );

  // ---------- joints ----------
  const arcSize = (w: number, h: number, count: number) =>
    Math.floor(Math.max(56, Math.min((w - (count - 1) * gap) / count, h - size * 1.6, 120)));
  const arc = (i: number, s: number) => {
    const name = `${t('driveJoint')}${i + 1}`;
    return (
      <JointArc
        key={ARM_AXES[i]}
        axis={ARM_AXES[i]}
        name={name}
        angle={shownJoints ? shownJoints[i] : null}
        size={s}
        text={size}
        labels={[`${name} ${t('driveJointLess')}`, `${name} ${t('driveJointMore')}`]}
        hold={hold}
      />
    );
  };

  // ---------- poses ----------
  const groups = splitPoses(poses ?? [], saved);
  const poseChip = (n: string, deletable: boolean) => (
    <View key={n} style={[styles.poseChip, styles.row, { height: touch, paddingHorizontal: size * 0.3 }]}>
      <Pressable
        onPress={() => pickPose(n)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled, busy: posing === n }}
        style={({ pressed }) => [styles.row, { height: touch, paddingHorizontal: size * 0.7 }, !enabled && styles.dim, pressed && styles.pressed]}
      >
        {posing === n ? <ActivityIndicator size="small" color={mono.text} /> : <Text style={[styles.poseText, { fontSize: size * 0.85 }]}>{poseName(n)}</Text>}
      </Pressable>
      {deletable && <DeleteButton size={Math.round(size * 2)} label={fill(t('armPoseDeleteLabel'), { pose: n })} onPress={() => removePose(n)} />}
    </View>
  );
  const poseGroup = (title: TextKey, names: string[], deletable: boolean) =>
    names.length > 0 && (
      <View style={{ gap: size * 0.4 }}>
        <Text style={[styles.subLabel, { fontSize: size * 0.66 }]}>{t(title)}</Text>
        <View style={[styles.row, styles.wrap, { gap: size * 0.45 }]}>{names.map((n) => poseChip(n, deletable))}</View>
      </View>
    );
  const saveButton = <TextButton text={t('armSave')} size={size} height={Math.max(36, size * 2.4)} onPress={savePose} dim={!powered} busy={saving} />;
  // a fixed area that scrolls by itself: more poses never move the rest
  const posesList = (
    <ScrollView style={styles.grow} contentContainerStyle={{ gap: size * 0.8, paddingBottom: 4 }} nestedScrollEnabled>
      {!wide && <View style={styles.row}>{saveButton}</View>}
      {poses === null && <ActivityIndicator size="small" color={mono.soft} />}
      {poses?.length === 0 && <Text style={[styles.soft, { fontSize: size * 0.85 }]}>{t('armNoPoses')}</Text>}
      {poseGroup('armPosesSaved', groups.saved, true)}
      {poseGroup('armPosesBuiltIn', groups.builtIn, false)}
    </ScrollView>
  );

  // ---------- gripper ----------
  const gripperButtons = (h: number, column: boolean) =>
    gripBusy ? (
      <View style={[styles.grow, { minHeight: h, justifyContent: 'center' }]}>
        <ActivityIndicator size="small" color={mono.text} />
      </View>
    ) : (
      <View style={[column ? null : styles.row, { gap: size * 0.5 }]}>
        <TextButton text={t('gripperOpen')} size={size} height={h} onPress={() => grip(true)} dim={!powered} grow={!column} />
        <TextButton text={t('gripperClose')} size={size} height={h} onPress={() => grip(false)} dim={!powered} grow={!column} />
      </View>
    );
  const gripperState = gripper && <Text style={[styles.value, { fontSize: size * 0.85 }]}>{t(GRIPPER_TEXT[gripper])}</Text>;

  // ---------- the hand pad ----------
  const pad = (d: number) => (
    <HandPad
      diameter={d}
      text={size}
      names={Object.fromEntries(Object.entries(PAD_NAMES).map(([k, v]) => [k, t(v)])) as Record<PadKey | 'zUp' | 'zDown', string>}
      labels={Object.fromEntries(Object.entries(PAD_LABELS).map(([k, v]) => [k, t(v)])) as Record<PadKey | 'zUp' | 'zDown', string>}
      hold={handHold}
    />
  );

  // ---------- speed ----------
  const legacyButton = (style: object) => (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        setLegacySpeed(nextSpeed);
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${t('driveSpeed')} ${t(SPEED_TEXT[legacySpeed])}`}
      style={({ pressed }) => [styles.pill, { gap: size * 0.3 }, style, pressed && styles.pressed]}
    >
      <Text style={[styles.label, { fontSize: size * 0.7 }]}>{t('driveSpeed')}</Text>
      <Text style={[styles.value, { fontSize: size * 0.9 }]}>{t(SPEED_TEXT[legacySpeed])}</Text>
    </Pressable>
  );

  if (lay.kind === 'wide') {
    const s = arcSize(jointArea.w, jointArea.h, 6);
    // the pad takes only the room the gripper and the speed leave, so the speed's tick labels are never pushed out
    const d = Math.floor(Math.max(0, Math.min(padArea.w / 1.42, padArea.h, 210)));
    return (
      <View style={[styles.grow, { gap }]}>
        <View style={[styles.row, styles.between]}>
          {chip}
          {stop}
        </View>
        <View style={[styles.columns, { gap }]}>
          <View style={{ width: lay.left, gap }}>
            {sim}
            <View style={[styles.card, styles.jointsWide, { padding: size * 0.8, gap: size * 0.6 }]}>
              <View style={[styles.row, styles.between, { minHeight: Math.max(36, size * 2.4) }]}>
                <Segment
                  items={(['joints', 'poses'] as const).map((k) => ({ id: k, text: t(k === 'joints' ? 'driveJoints' : 'armSetupPoses') }))}
                  value={tab === 'poses' ? 'poses' : 'joints'}
                  onChange={(k) => {
                    jog.release();
                    setTab(k);
                  }}
                  size={size * 0.8}
                  height={Math.max(36, size * 2.4)}
                />
                {tab === 'poses' && saveButton}
              </View>
              <View style={styles.grow} onLayout={(e) => setJointArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
                {tab === 'poses' ? (
                  posesList
                ) : (
                  <View style={[styles.row, styles.between, styles.grow]}>{jointArea.w > 0 && ARM_AXES.map((_, i) => arc(i, s))}</View>
                )}
              </View>
            </View>
          </View>
          <View style={[styles.card, { width: lay.right, padding: size * 0.9, gap: size * 0.9 }]}>
            <Text style={[styles.section, { fontSize: size * 0.72 }]}>{t('armSpaceAdjust')}</Text>
            <View
              style={[styles.grow, styles.centre]}
              onLayout={(e) => setPadArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            >
              {d >= 64 && pad(d)}
            </View>
            <View style={[styles.divider, { gap: size * 0.5, paddingTop: size * 0.8 }]}>
              <View style={[styles.row, styles.between]}>
                <Text style={[styles.section, { fontSize: size * 0.72 }]}>{t('gripper')}</Text>
                {gripperState}
              </View>
              {gripperButtons(touch, false)}
            </View>
            <View style={[styles.divider, { paddingTop: size * 0.8 }]}>
              {speedReady ? (
                <TickSlider
                  value={speedReady.percent}
                  range={speedReady}
                  text={size}
                  label={t('driveSpeed')}
                  onChange={armSpeed.change}
                  onRelease={armSpeed.release}
                  onStep={armSpeed.step}
                />
              ) : (
                legacyButton({ height: touch, flexDirection: 'row' })
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ---------- a phone on its side: 3D | tabs | speed ----------
  const contentH = Math.max(0, panelHeight - Math.max(36, size * 2.4) - gap - 2 * size * 0.5);
  const s = Math.floor(Math.max(60, Math.min(contentH - size * 1.6, 96)));
  const d = Math.floor(Math.max(76, Math.min(contentH - 2, 140)));
  return (
    <View style={[styles.columns, { gap }]} onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}>
      {sim}
      <View style={{ width: lay.controls, gap }}>
        <Segment
          items={(['joints', 'poses', 'move'] as const).map((k) => ({
            id: k,
            text: t(k === 'joints' ? 'driveJoints' : k === 'poses' ? 'armSetupPoses' : 'armSetupMove'),
          }))}
          value={tab}
          onChange={(k) => {
            jog.release();
            setTab(k);
          }}
          size={size * 0.72}
          height={Math.max(36, size * 2.4)}
          stretch
        />
        <View style={[styles.card, styles.grow, { padding: size * 0.5 }]}>
          {tab === 'poses' && posesList}
          {tab === 'joints' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap, alignItems: 'center' }}>
              {panelHeight > 0 && ARM_AXES.map((_, i) => arc(i, s))}
            </ScrollView>
          )}
          {tab === 'move' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: gap * 1.5, alignItems: 'center' }}>
              {panelHeight > 0 && pad(d)}
              <View style={{ gap: size * 0.3, width: size * 6 }}>
                <View style={[styles.row, styles.between]}>
                  <Text style={[styles.section, { fontSize: size * 0.62 }]}>{t('gripper')}</Text>
                  {gripperState}
                </View>
                {gripperButtons(Math.max(30, Math.floor((contentH - size * 1.6) / 2)), true)}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
      {panelHeight > 0 &&
        (speedReady ? (
          <SpeedFader
            value={speedReady.percent}
            range={speedReady}
            width={lay.fader}
            height={panelHeight}
            size={size * 0.85}
            label={t('driveSpeed')}
            lessLabel={t('driveSpeedLess')}
            moreLabel={t('driveSpeedMore')}
            onChange={armSpeed.change}
            onRelease={armSpeed.release}
            onStep={armSpeed.step}
          />
        ) : (
          legacyButton({ width: lay.fader, height: panelHeight, borderRadius: 18 })
        ))}
    </View>
  );
}

function Segment<T extends string>({
  items,
  value,
  onChange,
  size,
  height,
  stretch,
}: {
  items: { id: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
  size: number;
  height: number;
  /** The tabs share the whole width. */
  stretch?: boolean;
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
              { paddingHorizontal: stretch ? size * 0.4 : size * 1.1, height: height - 4 },
              stretch && styles.grow,
              on && styles.segmentOn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentText, { fontSize: size }, on && styles.segmentTextOn]} numberOfLines={1}>
              {it.text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TextButton({
  text,
  size,
  height,
  onPress,
  dim,
  busy,
  grow,
}: {
  text: string;
  size: number;
  height: number;
  onPress: () => void;
  dim?: boolean;
  busy?: boolean;
  grow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={Math.max(4, Math.ceil((44 - height) / 2))}
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!dim }}
      style={({ pressed }) => [
        styles.pill,
        { height, paddingHorizontal: size * 1.1, minWidth: size * 5 },
        grow && styles.grow,
        dim && styles.dim,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={mono.text} /> : <Text style={[styles.buttonText, { fontSize: size * 0.85 }]}>{text}</Text>}
    </Pressable>
  );
}

/** The small delete control on a saved pose. */
function DeleteButton({ size, label, onPress }: { size: number; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
  grow: { flex: 1 },
  columns: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  sim: { overflow: 'hidden', backgroundColor: SIM_GREY },
  simWide: { flex: 1.9 },
  jointsWide: { flex: 1 },
  stopCorner: { position: 'absolute', top: 6, right: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 },
  // at least the card's two corners high and in from them: a thinner strip looked like an ellipse (owner, 2026-11-20)
  tcp: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'center',
    rowGap: 2,
    minHeight: 2 * CARD_RADIUS,
    backgroundColor: 'rgba(10,11,13,0.92)',
  },
  tcpPart: { fontFamily: fonts.monoBold, color: mono.text },
  tcpThird: { width: '33%' },
  tcpName: { fontFamily: fonts.mono, color: mono.soft },
  subLabel: { fontFamily: fonts.mono, color: mono.dim, letterSpacing: 1.5, textTransform: 'uppercase' },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.38 },
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#0e0f11',
  },
  section: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1.8, textTransform: 'uppercase' },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1, textTransform: 'uppercase' },
  value: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 0.5, textTransform: 'uppercase' },
  soft: { fontFamily: fonts.mono, color: mono.soft },
  pill: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(232,232,232,0.35)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1, textTransform: 'uppercase' },
  stop: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,45,45,0.7)',
    backgroundColor: 'rgba(255,45,45,0.1)',
    justifyContent: 'center',
  },
  stopText: { fontFamily: fonts.monoBold, color: mono.red, letterSpacing: 1.2, textTransform: 'uppercase' },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'rgba(8,8,8,0.92)',
  },
  segmentItem: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  segmentText: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1.2, textTransform: 'uppercase' },
  segmentTextOn: { fontFamily: fonts.monoBold, color: mono.text },
  joint: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  poseChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  poseText: { fontFamily: fonts.mono, color: mono.text },
  delete: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: mono.red,
    backgroundColor: 'rgba(255,45,45,0.12)',
  },
});
