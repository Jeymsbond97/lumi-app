// The Map screen's VIEW and BASE lists and what VIEW draws on the map: what the base's own page (:9001) has in its top
// bar (track, laser, global path; the robot's state, ultrasonic and infrared), in the navbar's look (docs/MAP.md).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  baseText,
  NEAR_M,
  rangeText,
  sensorName,
  speedText,
  turnText,
  type BaseState,
  type Range,
  type Sensors,
  type Trail,
} from '../lib/baseInfo';
import { useI18n, type TextKey } from '../lib/i18n';
import { fonts, mono } from './theme';

export type Layer = 'follow' | 'laser' | 'trail' | 'plan';
export const LAYERS: { key: Layer; label: TextKey }[] = [
  { key: 'follow', label: 'viewFollow' },
  { key: 'laser', label: 'viewLaser' },
  { key: 'trail', label: 'viewTrail' },
  { key: 'plan', label: 'viewPlan' },
];

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.rowText, on && styles.rowTextOn]}>{label}</Text>
      <View style={[styles.switch, on && styles.switchOn]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

export function ViewList({
  on,
  onToggle,
  trailPoints,
  onClearTrail,
}: {
  on: Record<Layer, boolean>;
  onToggle: (l: Layer) => void;
  trailPoints: number;
  onClearTrail: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {LAYERS.map((l) => (
        <Toggle key={l.key} label={t(l.label)} on={on[l.key]} onPress={() => onToggle(l.key)} />
      ))}
      {trailPoints > 1 && (
        <>
          <View style={styles.sep} />
          <Pressable onPress={onClearTrail} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.rowText}>{t('viewTrailClear')}</Text>
          </Pressable>
        </>
      )}
    </>
  );
}

function Reading({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <View style={styles.reading}>
      <Text style={styles.readingLabel}>{label}</Text>
      <Text style={[styles.readingValue, bad && styles.readingBad]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Ranges({ title, ranges }: { title: TextKey; ranges: Range[] }) {
  const { t } = useI18n();
  return (
    <>
      <Text style={styles.title}>{t(title)}</Text>
      {ranges.length === 0 ? (
        <Text style={styles.quiet}>{t('baseNoReadings')}</Text>
      ) : (
        ranges.map((r) => {
          const n = sensorName(r.name);
          const label = n.side ? `${t(n.side)}${n.n ? ` ${n.n}` : ''}` : n.n;
          return (
            <Reading
              key={r.name}
              label={label}
              value={r.m === null ? t('baseClear') : rangeText(r.m)}
              bad={r.m !== null && r.m < NEAR_M}
            />
          );
        })
      )}
    </>
  );
}

/** What the base says now: its state, E-STOP, a fault, the speed, and what ultrasonic and infrared see. */
export function BaseList({
  base,
  sensors,
  needsUpdate,
}: {
  base: BaseState | null;
  sensors: Sensors | null;
  needsUpdate: boolean;
}) {
  const { t } = useI18n();
  if (!base) return <Text style={styles.quiet}>{t('statusBaseOffline')}</Text>;
  return (
    <>
      <Reading label={t('baseState')} value={t(baseText(base))} bad={base.softEstop || base.hardEstop} />
      {base.move === 'running' && base.target !== '' && <Reading label={t('baseTarget')} value={base.target} />}
      <Reading
        label={t('baseEstop')}
        value={t(base.hardEstop ? 'estopHardOn' : base.softEstop ? 'estopSoftOn' : 'estopOff')}
        bad={base.softEstop || base.hardEstop}
      />
      <Reading label={t('baseFault')} value={base.errorCode ?? t('baseNoFault')} bad={base.errorCode !== null} />
      {needsUpdate ? (
        <>
          <View style={styles.sep} />
          <Text style={styles.quiet}>{t('baseSensorsNeedUpdate')}</Text>
        </>
      ) : (
        sensors && (
          <>
            {sensors.linear !== null && <Reading label={t('baseSpeed')} value={speedText(sensors.linear)} />}
            {sensors.angular !== null && <Reading label={t('baseTurn')} value={turnText(sensors.angular)} />}
            <View style={styles.sep} />
            <Ranges title="baseUltrasonic" ranges={sensors.ultrasonic} />
            <View style={styles.sep} />
            <Ranges title="baseInfrared" ranges={sensors.infrared} />
          </>
        )
      )}
    </>
  );
}

type P = { x: number; y: number };
const pathOf = (pts: P[], toView: (x: number, y: number) => P) =>
  pts
    .map((q, i) => {
      const v = toView(q.x, q.y);
      return `${i ? 'L' : 'M'}${v.x.toFixed(1)} ${v.y.toFixed(1)}`;
    })
    .join(' ');

/** VIEW on the map: the trail (green), the planned path (blue, as on the base's page) and the laser (red dots). */
export function MapLayers({
  width,
  height,
  toView,
  trail,
  plan,
  laser,
}: {
  width: number;
  height: number;
  toView: (x: number, y: number) => P;
  trail: Trail | null;
  plan: P[] | null;
  laser: P[] | null;
}) {
  if (!trail?.length && !plan?.length && !laser?.length) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {trail?.map((piece, i) =>
        piece.length > 1 ? (
          <Path
            key={`t${i}`}
            d={pathOf(piece, toView)}
            stroke={mono.green}
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null,
      )}
      {plan && plan.length > 1 && (
        <Path
          d={pathOf(plan, toView)}
          stroke={mono.blue}
          strokeWidth={2.5}
          strokeDasharray="7 5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {laser?.map((q, i) => {
        const v = toView(q.x, q.y);
        return <Circle key={`l${i}`} cx={v.x} cy={v.y} r={1.6} fill={mono.red} />;
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rowText: { fontFamily: fonts.mono, fontSize: 12, color: '#cfcfcf' },
  rowTextOn: { color: mono.text, fontFamily: fonts.monoBold },
  switch: {
    width: 36,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchOn: { borderColor: mono.green, backgroundColor: 'rgba(61,255,139,0.15)' },
  knob: { width: 14, height: 14, borderRadius: 7, backgroundColor: mono.soft },
  knobOn: { backgroundColor: mono.green, alignSelf: 'flex-end' },
  sep: { height: 1, backgroundColor: '#333', marginVertical: 4 },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  readingLabel: { fontFamily: fonts.mono, fontSize: 12, color: mono.soft },
  readingValue: { fontFamily: fonts.monoBold, fontSize: 12, color: mono.text, flexShrink: 1, textAlign: 'right' },
  readingBad: { color: mono.yellow },
  title: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: mono.soft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  quiet: { fontFamily: fonts.mono, fontSize: 12, color: mono.dim, paddingHorizontal: 10, paddingVertical: 5 },
  pressed: { opacity: 0.6 },
});
