// ARM SETUP's controls in Cobo π's shapes (shapes in lib/armPad), dark themed:
// - JointArc: a joint's angle over its quarter ring; hold the lower left half for minus, the upper right for plus;
// - HandPad: the Z capsule (Z+ top, Z- bottom) beside the round pad (Y+ top, Y- bottom, X- left, X+ right);
// - TickSlider: the arm speed on Cobo π's ticked scale (1, 5, 20, 50, 100), its percent in a box at the top right.
// Each half or wedge is a bare HoldButton over the drawing, so holding works as everywhere (ui/useJogHold).
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { jointArc, padWedges, type Box, type PadKey } from '../lib/armPad';
import { sameJog, HoldButton } from './HoldButton';
import type { ArmAxis, JogCommand, TcpAxis } from '../lib/jog';
import { SPEED_STEP, stepPercent, tickFraction, tickLabels, tickValue, type SpeedRange } from '../lib/speed';
import type { JogControl } from './useJogHold';
import { fonts, mono } from './theme';

const FILL = 'rgba(255,255,255,0.07)';
const EDGE = 'rgba(255,255,255,0.28)';
const HELD = mono.red;

const at = (b: Box) => ({ position: 'absolute' as const, left: b.x, top: b.y, width: b.w, height: b.h });
/** Touch room round a box drawn under 44 px. */
const slopOf = (b: Box) => Math.max(2, Math.ceil((44 - Math.min(b.w, b.h)) / 2));

interface Hold {
  jog: JogControl;
  speed: number;
  enabled: boolean;
  why: () => void;
  /** The controls scroll: holds start after a still moment (HoldButton `delayed`). */
  delayed: boolean;
}

// ---------- a joint ----------
export function JointArc({
  axis,
  name,
  angle,
  size,
  text,
  labels,
  hold,
}: {
  axis: ArmAxis;
  name: string;
  angle: number | null;
  size: number;
  text: number;
  /** Screen reader names of minus and plus. */
  labels: [string, string];
  hold: Hold;
}) {
  const g = useMemo(() => jointArc(size), [size]);
  const minus: JogCommand = { axis, direction: -1, speed: hold.speed };
  const plus: JogCommand = { axis, direction: 1, speed: hold.speed };
  const minusHeld = sameJog(hold.jog.held, minus);
  const plusHeld = sameJog(hold.jog.held, plus);
  return (
    <View style={{ width: size, gap: text * 0.3 }}>
      <Text style={[styles.angle, { fontSize: text * 0.95 }]} numberOfLines={1}>
        {angle === null ? ' ' : `${angle.toFixed(1)}°`}
      </Text>
      <View style={[{ width: size, height: size }, !hold.enabled && styles.off]}>
        <Svg width={size} height={size} pointerEvents="none">
          <Path d={g.minus} fill={minusHeld ? HELD : FILL} stroke={minusHeld ? HELD : EDGE} strokeWidth={1} />
          <Path d={g.plus} fill={plusHeld ? HELD : FILL} stroke={plusHeld ? HELD : EDGE} strokeWidth={1} />
          <Path d={g.minusChevron} stroke={mono.text} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={g.plusChevron} stroke={mono.text} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={[styles.jointName, { fontSize: text * 0.95, right: size - g.centre.x + 2, bottom: size - g.centre.y + 2 }]}>{name}</Text>
        <HoldButton bare style={at(g.minusBox)} slop={slopOf(g.minusBox)} cmd={minus} jog={hold.jog} glyph="minus" label={labels[0]} size={size} disabled={!hold.enabled} onDisabledPress={hold.why} delayed={hold.delayed} />
        <HoldButton bare style={at(g.plusBox)} slop={slopOf(g.plusBox)} cmd={plus} jog={hold.jog} glyph="plus" label={labels[1]} size={size} disabled={!hold.enabled} onDisabledPress={hold.why} delayed={hold.delayed} />
      </View>
    </View>
  );
}

// ---------- the hand: Z capsule and the round X Y pad ----------
/** What each wedge moves: the arm's base frame, x +1 forward, y +1 left, z +1 up (lib/jog). */
const PAD_MOVES: Record<PadKey, { axis: TcpAxis; direction: 1 | -1 }> = {
  up: { axis: 'tcp_y', direction: 1 },
  down: { axis: 'tcp_y', direction: -1 },
  right: { axis: 'tcp_x', direction: 1 },
  left: { axis: 'tcp_x', direction: -1 },
};

export function HandPad({
  diameter,
  text,
  names,
  labels,
  hold,
}: {
  diameter: number;
  text: number;
  /** What each part shows: Y+, X+, Y-, X-, Z+, Z-. */
  names: Record<PadKey | 'zUp' | 'zDown', string>;
  /** What screen readers say for each part. */
  labels: Record<PadKey | 'zUp' | 'zDown', string>;
  hold: Hold;
}) {
  const d = diameter;
  const { wedges, hub } = useMemo(() => padWedges(d), [d]);
  const w = Math.max(44, Math.round(d * 0.3));
  const half = d / 2;
  const cmd = (axis: TcpAxis, direction: 1 | -1): JogCommand => ({ axis, direction, speed: hold.speed });
  const zUp = cmd('tcp_z', 1);
  const zDown = cmd('tcp_z', -1);
  const zUpHeld = sameJog(hold.jog.held, zUp);
  const zDownHeld = sameJog(hold.jog.held, zDown);
  const bare = (c: JogCommand, label: string, box: Box) => (
    <HoldButton key={label} bare style={at(box)} slop={slopOf(box)} cmd={c} jog={hold.jog} glyph="plus" label={label} size={d} disabled={!hold.enabled} onDisabledPress={hold.why} delayed={hold.delayed} />
  );
  return (
    <View style={[styles.row, { gap: d * 0.1 }, !hold.enabled && styles.off]}>
      <View style={{ width: w, height: d }}>
        <Svg width={w} height={d} pointerEvents="none">
          <Path d={`M1 ${half - 1} V${w / 2} A${w / 2 - 1} ${w / 2 - 1} 0 0 1 ${w - 1} ${w / 2} V${half - 1} Z`} fill={zUpHeld ? HELD : FILL} stroke={zUpHeld ? HELD : EDGE} />
          <Path d={`M1 ${half + 1} V${d - w / 2} A${w / 2 - 1} ${w / 2 - 1} 0 0 0 ${w - 1} ${d - w / 2} V${half + 1} Z`} fill={zDownHeld ? HELD : FILL} stroke={zDownHeld ? HELD : EDGE} />
          <Path d={`M${w / 2 - 6} ${w * 0.62} L${w / 2} ${w * 0.62 - 7} L${w / 2 + 6} ${w * 0.62}`} stroke={mono.text} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Path d={`M${w / 2 - 6} ${d - w * 0.62} L${w / 2} ${d - w * 0.62 + 7} L${w / 2 + 6} ${d - w * 0.62}`} stroke={mono.text} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
        <Text style={[styles.padName, { fontSize: text * 0.85, top: half * 0.62, width: w }]}>{names.zUp}</Text>
        <Text style={[styles.padName, { fontSize: text * 0.85, top: half * 1.22, width: w }]}>{names.zDown}</Text>
        {bare(zUp, labels.zUp, { x: 0, y: 0, w, h: half })}
        {bare(zDown, labels.zDown, { x: 0, y: half, w, h: half })}
      </View>
      <View style={{ width: d, height: d }}>
        <Svg width={d} height={d} pointerEvents="none">
          <Circle cx={d / 2} cy={d / 2} r={d / 2 - 0.5} fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.12)" />
          {wedges.map((wd) => {
            const m = PAD_MOVES[wd.key];
            const held = sameJog(hold.jog.held, cmd(m.axis, m.direction));
            return <Path key={wd.key} d={wd.path} fill={held ? HELD : FILL} stroke={held ? HELD : EDGE} strokeWidth={1} />;
          })}
          <Circle cx={d / 2} cy={d / 2} r={hub} fill="rgba(255,255,255,0.05)" stroke={EDGE} />
          <Rect x={d / 2 - 1} y={d / 2 - 1} width={2} height={2} fill={mono.soft} />
        </Svg>
        {wedges.map((wd) => (
          <Text key={wd.key} style={[styles.padName, { fontSize: text * 0.85, width: 40, left: wd.label.x - 20, top: wd.label.y - text * 0.6 }]}>
            {names[wd.key]}
          </Text>
        ))}
        {wedges.map((wd) => {
          const m = PAD_MOVES[wd.key];
          return bare(cmd(m.axis, m.direction), labels[wd.key], wd.box);
        })}
      </View>
    </View>
  );
}

// ---------- the ticked speed slider ----------
export function TickSlider({
  value,
  range,
  text,
  label,
  onChange,
  onRelease,
  onStep,
}: {
  value: number;
  range: SpeedRange;
  text: number;
  label: string;
  onChange: (v: number) => void;
  onRelease: (v: number) => void;
  onStep: (v: number) => void;
}) {
  const thumb = 22;
  const width = useRef(0);
  const startX = useRef(0);
  const startPageX = useRef(0);
  const last = useRef(value);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) last.current = value;
  }, [value, dragging]);

  const move = (x: number) => {
    const v = tickValue((x - thumb / 2) / Math.max(1, width.current - thumb), range);
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
  const onEnd = () => {
    setDragging(false);
    onRelease(last.current);
  };
  const step = (by: number) => {
    const v = stepPercent(value, by, range);
    if (v !== value) onStep(v);
  };

  const f = tickFraction(value, range);
  const ticks = tickLabels(range);
  return (
    <View style={{ gap: text * 0.3 }}>
      <View style={[styles.row, styles.between]}>
        <Text style={[styles.section, { fontSize: text * 0.72 }]}>{label}</Text>
        <View style={[styles.valueBox, { paddingHorizontal: text * 0.6, height: text * 2 }]}>
          <Text style={[styles.valueText, { fontSize: text * 0.95 }]}>{`${value} %`}</Text>
        </View>
      </View>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={(e) => move(startX.current + e.nativeEvent.pageX - startPageX.current)}
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
        style={styles.track}
      >
        <View style={[styles.rail, { marginHorizontal: thumb / 2 }]} pointerEvents="none">
          <View style={[styles.railFill, { width: `${f * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumbLane, { left: 0, right: thumb }]}>
          <View style={[styles.thumb, { width: thumb, height: thumb, borderRadius: thumb / 2, left: `${f * 100}%` }, dragging && styles.thumbHeld]} />
        </View>
      </View>
      <View style={[styles.ticks, { marginHorizontal: thumb / 2, height: text * 0.9 + 8 }]} pointerEvents="none">
        {ticks.map((tk) => (
          <View key={tk.value} style={[styles.tick, { left: `${tk.at * 100}%` }]}>
            <View style={styles.tickMark} />
            <Text style={[styles.tickText, { fontSize: text * 0.66, lineHeight: text * 0.9 }]} numberOfLines={1}>
              {tk.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  off: { opacity: 0.4 },
  angle: { fontFamily: fonts.monoBold, color: mono.text, textAlign: 'center' },
  jointName: { position: 'absolute', fontFamily: fonts.monoBold, color: mono.soft },
  padName: { position: 'absolute', fontFamily: fonts.monoBold, color: mono.text, textAlign: 'center' },
  section: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1.8, textTransform: 'uppercase' },
  valueBox: {
    minWidth: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  valueText: { fontFamily: fonts.monoBold, color: '#ffffff' },
  track: { height: 44, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  railFill: { height: 4, backgroundColor: mono.text },
  thumbLane: { position: 'absolute', top: 0, bottom: 0 },
  thumb: { position: 'absolute', top: 11, backgroundColor: mono.text, borderWidth: 2, borderColor: '#000' },
  thumbHeld: { backgroundColor: mono.red },
  ticks: { position: 'relative' },
  tick: { position: 'absolute', top: 0, width: 30, marginLeft: -15, alignItems: 'center' },
  tickMark: { width: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.4)' },
  tickText: { fontFamily: fonts.mono, color: mono.soft, marginTop: 1 },
});
