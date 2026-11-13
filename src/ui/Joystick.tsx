// Drive the base with one round pad, bottom left: up forward, down back, left and right turn, diagonal both;
// further from the centre is faster. Lumi moves only while the thumb is on the pad: lifting it sends a stop at once,
// and the robot also stops by itself 0.35 s after the last command (a dropped connection, a closed app).
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { BusyError, jog, jogStop } from '../lib/api';
import { clampToPad, padToJog, type AxisCommand } from '../lib/drive';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts, mono } from './theme';

const SEND_MS = 150; // the robot keeps an axis going 0.35 s after each command
const NOTE_MS = 2500;

function Arrows({ size }: { size: number }) {
  const c = size / 2;
  const a = size * 0.36; // distance of each arrow from the centre
  const s = size * 0.045;
  const tri = (dx: number, dy: number) => {
    const x = c + dx * a;
    const y = c + dy * a;
    // a small triangle pointing outwards
    return `M${x + dx * s} ${y + dy * s} L${x - dy * s - dx * s} ${y + dx * s - dy * s} L${x + dy * s - dx * s} ${y - dx * s - dy * s} Z`;
  };
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={[tri(0, -1), tri(0, 1), tri(-1, 0), tri(1, 0)].join(' ')} fill="rgba(232,232,232,0.4)" />
    </Svg>
  );
}

export function Joystick() {
  const { t } = useI18n();
  const { connection } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const size = clamp(120, 0.27 * h, 200);
  const radius = size / 2;
  const knob = size * 0.38;

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);
  const [note, setNote] = useState<'busy' | 'noAnswer' | null>(null);

  // the latest values for the gesture and timer callbacks, which are made once
  const url = useRef(connection.baseUrl);
  const rad = useRef(radius);
  useEffect(() => {
    url.current = connection.baseUrl;
    rad.current = radius;
  }, [connection.baseUrl, radius]);
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

  const release = () => {
    clearInterval(timer.current);
    timer.current = undefined;
    const wasMoving = cmds.current.length > 0;
    cmds.current = [];
    setPos({ x: 0, y: 0 });
    setHeld(false);
    // stop now instead of waiting for the robot's own 0.35 s
    jogStop(url.current).catch(() => (wasMoving ? show('noAnswer') : undefined));
  };

  // where the finger went down: its offset from the pad's centre, and its place on the screen
  const start = useRef({ x: 0, y: 0, pageX: 0, pageY: 0 });

  const onGrant = (e: GestureResponderEvent) => {
    const n = e.nativeEvent;
    start.current = { x: n.locationX - radius, y: n.locationY - radius, pageX: n.pageX, pageY: n.pageY };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setHeld(true);
    moveTo(start.current.x, start.current.y);
    send();
    clearInterval(timer.current);
    timer.current = setInterval(send, SEND_MS);
  };

  const onMove = (e: GestureResponderEvent) => {
    const n = e.nativeEvent;
    moveTo(start.current.x + n.pageX - start.current.pageX, start.current.y + n.pageY - start.current.pageY);
  };

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

  return (
    <View style={[styles.root, { left: 24 + inset.left, bottom: 18 + inset.bottom }]} pointerEvents="box-none">
      {note && <Text style={styles.note}>{t(note)}</Text>}
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={release}
        onResponderTerminate={release}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('drive')}
        style={[styles.pad, { width: size, height: size, borderRadius: radius }, held && styles.padHeld]}
      >
        <Arrows size={size} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-start', gap: 10 },
  // style D: a dashed ring with a solid white knob
  pad: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#6a6a6a',
  },
  padHeld: { borderColor: mono.text },
  knob: { position: 'absolute', backgroundColor: mono.text },
  knobHeld: { backgroundColor: mono.red },
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
