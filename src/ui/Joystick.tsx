// Drive the base with one round pad, bottom right: up forward, down back, left and right turn, diagonal both;
// further from the centre is faster. Lumi moves only while the thumb is on the pad: lifting it sends a stop at once,
// and the robot also stops by itself 0.35 s after the last command (a dropped connection, a closed app).
// A stray touch must not drive: the pad is locked (dim, it sends nothing) until the slider under it is slid to the
// right; sliding it back shuts it. It also locks after 5 minutes with no touch on the screen, on STOP and when the
// app leaves the foreground (lib/driveLock).
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useSteadyWindow } from '../lib/steadyWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';
import { BusyError, jog, jogStop } from '../lib/api';
import { clampToPad, padToJog, type AxisCommand } from '../lib/drive';
import {
  fingerOf,
  lastTouchAt,
  LOCKED,
  mayDrive,
  onDriveStop,
  shouldRelock,
  slideFraction,
  slideTo,
  touchEnd,
  touchStart,
  unlockAt,
  type DriveLock,
} from '../lib/driveLock';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts, mono } from './theme';

const SEND_MS = 150; // the robot keeps an axis going 0.35 s after each command
const NOTE_MS = 2500;
const RELOCK_CHECK_MS = 1000;
const DOTS = 40;
const SLIDER_H = 44;
const THUMB = 38;

/** Style D: a ring of small dots and four direction marks, like the dot matrix name. */
function DotRing({ size, locked }: { size: number; locked: boolean }) {
  const c = size / 2;
  const ring = c - size * 0.04;
  const dot = size * 0.012;
  const colour = locked ? mono.dim : mono.text;
  const a = size * 0.36; // distance of each mark from the centre
  const s = size * 0.045;
  const tri = (dx: number, dy: number) => {
    const x = c + dx * a;
    const y = c + dy * a;
    return `M${x + dx * s} ${y + dy * s} L${x - dy * s - dx * s} ${y + dx * s - dy * s} L${x + dy * s - dx * s} ${y - dx * s - dy * s} Z`;
  };
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: DOTS }, (_, i) => {
        const t = (i / DOTS) * 2 * Math.PI;
        return <Circle key={i} cx={c + ring * Math.cos(t)} cy={c + ring * Math.sin(t)} r={dot} fill={colour} opacity={0.55} />;
      })}
      <Path d={[tri(0, -1), tri(0, 1), tri(-1, 0), tri(1, 0)].join(' ')} fill={colour} opacity={0.45} />
    </Svg>
  );
}

/** The pad's width (and height): screens beside it keep this much free on the right. */
export const joystickSize = (h: number) => clamp(120, 0.27 * h, 200);

export function Joystick() {
  const { t } = useI18n();
  const { connection } = useRobot();
  const { height: h } = useSteadyWindow();
  const inset = useSafeAreaInsets();
  const size = joystickSize(h);
  const radius = size / 2;
  const knob = size * 0.34;
  const sliderW = size + 20;
  const travel = sliderW - THUMB - 6;

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);
  const [note, setNote] = useState<'busy' | 'noAnswer' | null>(null);
  const [lock, setLockState] = useState<DriveLock>(LOCKED);
  const [slide, setSlide] = useState<number | null>(null); // the slider thumb's offset while it is dragged

  // the latest values for the gesture and timer callbacks, which are made once
  const url = useRef(connection.baseUrl);
  const rad = useRef(radius);
  const lockRef = useRef<DriveLock>(LOCKED);
  useEffect(() => {
    url.current = connection.baseUrl;
    rad.current = radius;
  }, [connection.baseUrl, radius]);
  const setLock = (s: DriveLock) => {
    lockRef.current = s;
    setLockState(s);
  };
  const cmds = useRef<AxisCommand[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = (n: 'busy' | 'noAnswer') => {
    setNote(n);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  };

  const send = () => {
    for (const c of cmds.current) {
      jog(url.current, c).catch((e) => show(e instanceof BusyError ? 'busy' : 'noAnswer'));
    }
  };

  const moveTo = (x: number, y: number) => {
    const p = clampToPad(x, y, rad.current);
    setPos(p);
    cmds.current = padToJog(p.x, p.y, rad.current);
  };

  // ends a drive: no more commands, knob back to the centre, and a stop now instead of the robot's own 0.35 s
  const stopDriving = () => {
    if (!timer.current) return;
    clearInterval(timer.current);
    timer.current = undefined;
    const wasMoving = cmds.current.length > 0;
    cmds.current = [];
    setPos({ x: 0, y: 0 });
    setHeld(false);
    jogStop(url.current).catch(() => (wasMoving ? show('noAnswer') : undefined));
  };

  const release = () => {
    if (!timer.current) return; // a touch on the locked pad never started a drive
    stopDriving();
    setLock(touchEnd(lockRef.current, Date.now()));
  };

  // where the finger went down: its offset from the pad's centre, and its place on the screen
  const start = useRef({ x: 0, y: 0, pageX: 0, pageY: 0, id: -1 });

  const onGrant = (e: GestureResponderEvent) => {
    if (!mayDrive(lockRef.current)) return; // locked: nothing moves, nothing is sent
    const n = e.nativeEvent;
    start.current = { x: n.locationX - radius, y: n.locationY - radius, pageX: n.pageX, pageY: n.pageY, id: Number(n.identifier) };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLock(touchStart(lockRef.current));
    setHeld(true);
    moveTo(start.current.x, start.current.y);
    send();
    clearInterval(timer.current);
    timer.current = setInterval(send, SEND_MS);
  };

  // only the finger that started the drive steers; another finger may be reaching for STOP
  const onMove = (e: GestureResponderEvent) => {
    if (!timer.current) return;
    const f = fingerOf(e.nativeEvent.touches.map((t) => ({ ...t, identifier: Number(t.identifier) })), start.current.id);
    if (!f) return;
    moveTo(start.current.x + f.pageX - start.current.pageX, start.current.y + f.pageY - start.current.pageY);
  };

  // While the pad holds the touch, React Native gives a second finger to the pad too, even one on STOP. So a
  // second finger anywhere means stop: the drive ends and the pad locks.
  const onExtraFinger = (e: GestureResponderEvent) => {
    if (timer.current && e.nativeEvent.touches.length > 1) {
      stopDriving();
      setLock(LOCKED);
      setSlide(null);
    }
  };

  const relock = () => {
    stopDriving();
    setLock(LOCKED);
  };

  // locking by itself: after 5 minutes with no touch on the screen, on STOP, and when the app goes to the background
  useEffect(() => {
    const check = setInterval(() => {
      if (shouldRelock(lockRef.current, lastTouchAt(), Date.now())) relock();
    }, RELOCK_CHECK_MS);
    const offStop = onDriveStop(relock);
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') relock();
    });
    return () => {
      clearInterval(check);
      offStop();
      app.remove();
    };
    // made once; it reads the latest state through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // leaving the screen while the thumb is down still stops the robot
  useEffect(
    () => () => {
      clearTimeout(noteTimer.current);
      if (timer.current) {
        clearInterval(timer.current);
        jogStop(url.current).catch(() => {});
      }
    },
    [],
  );

  const setOpen = (open: boolean) => {
    if (open === lockRef.current.unlocked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (open) setLock(unlockAt(Date.now()));
    else relock();
  };

  // the slider: to the right end opens the pad, back to the left end shuts it; let go halfway and the thumb returns
  const slideStart = useRef({ pageX: 0, from: 0 });
  const slideSpent = useRef(false); // one switch per slide: holding the thumb at an end must not switch again
  const onSlideGrant = (e: GestureResponderEvent) => {
    slideStart.current = { pageX: e.nativeEvent.pageX, from: lockRef.current.unlocked ? travel : 0 };
    slideSpent.current = false;
    setSlide(slideStart.current.from);
  };
  const onSlideMove = (e: GestureResponderEvent) => {
    const x = Math.min(travel, Math.max(0, slideStart.current.from + e.nativeEvent.pageX - slideStart.current.pageX));
    setSlide(x);
    if (slideSpent.current) return;
    const open = slideTo(lockRef.current.unlocked, slideFraction(x, travel));
    if (open !== lockRef.current.unlocked) {
      slideSpent.current = true;
      setOpen(open);
    }
  };
  const onSlideEnd = () => setSlide(null);

  const locked = !lock.unlocked;
  return (
    <View style={[styles.root, { right: 24 + inset.right, bottom: 18 + inset.bottom }]} pointerEvents="box-none">
      {note && <Text style={styles.note}>{t(note)}</Text>}
      <View
        onStartShouldSetResponder={() => mayDrive(lockRef.current)}
        onMoveShouldSetResponder={() => false}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderStart={onExtraFinger}
        onResponderMove={onMove}
        onResponderRelease={release}
        onResponderTerminate={release}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('drive')}
        accessibilityState={{ disabled: locked }}
        style={[styles.pad, { width: size, height: size, borderRadius: radius }, locked && styles.padLocked]}
      >
        <DotRing size={size} locked={locked} />
        <View
          pointerEvents="none"
          style={[
            styles.knob,
            {
              width: knob,
              height: knob,
              borderRadius: knob / 2,
              left: radius - knob / 2 + pos.x,
              top: radius - knob / 2 + pos.y,
            },
            held && styles.knobHeld,
          ]}
        />
      </View>
      <View
        style={[styles.slider, { width: sliderW }]}
        accessible
        accessibilityRole="switch"
        accessibilityLabel={t('unlockDriving')}
        accessibilityState={{ checked: !locked }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && setOpen(locked)}
      >
        <Text style={[styles.sliderText, !locked && styles.sliderTextOn]}>{t(locked ? 'slideToDrive' : 'driveOn')}</Text>
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={onSlideGrant}
          onResponderMove={onSlideMove}
          onResponderRelease={onSlideEnd}
          onResponderTerminate={onSlideEnd}
          hitSlop={8}
          style={[styles.thumb, { transform: [{ translateX: slide ?? (locked ? 0 : travel) }] }, !locked && styles.thumbOn]}
        >
          <Svg width={14} height={14} viewBox="0 0 14 14">
            <Path d="M5 2 L10 7 L5 12" stroke="#111" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-end', gap: 10 },
  pad: { backgroundColor: 'rgba(0,0,0,0.35)' },
  padLocked: { opacity: 0.35 },
  knob: {
    position: 'absolute',
    backgroundColor: mono.text,
    borderWidth: 6,
    borderColor: 'rgba(232,232,232,0.13)',
  },
  knobHeld: {
    backgroundColor: mono.red,
    borderColor: 'rgba(255,45,45,0.2)',
    shadowColor: mono.red,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 8,
  },
  slider: {
    height: SLIDER_H,
    borderRadius: SLIDER_H / 2,
    backgroundColor: 'rgba(0,0,0,0.67)',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderText: {
    position: 'absolute',
    left: THUMB + 6,
    right: 8,
    textAlign: 'center',
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: mono.soft,
  },
  sliderTextOn: { color: mono.green, left: 8, right: THUMB + 6 },
  thumb: {
    position: 'absolute',
    left: 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: mono.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbOn: { backgroundColor: mono.green },
  note: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: mono.yellow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
});
