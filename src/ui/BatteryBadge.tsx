// Battery in the top right, left of the language button: the percentage and a battery that fills with the charge.
// While Lumi charges a lightning bolt shows inside the battery; off the charger it is gone.
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { fonts } from './theme';

/** Fill colour by charge: green, yellow under 30 %, red under 15 %. */
export const batteryColour = (pct: number) => (pct < 15 ? '#ff5a52' : pct < 30 ? '#ffcf33' : '#7fe0a6');

const W = 34; // battery body, in its own units
const H = 18;

function BatteryIcon({ pct, charging, width }: { pct: number; charging: boolean; width: number }) {
  const inner = W - 6;
  const fill = Math.max(0, Math.min(1, pct / 100)) * inner;
  return (
    <Svg width={width} height={(width * H) / (W + 4)} viewBox={`0 0 ${W + 4} ${H}`}>
      <Rect x={1} y={1} width={W} height={H - 2} rx={4} fill="none" stroke="#c9d6dd" strokeWidth={1.6} />
      <Rect x={W + 1.5} y={H / 2 - 3} width={2.5} height={6} rx={1} fill="#c9d6dd" />
      {fill > 0 && <Rect x={4} y={4} width={fill} height={H - 8} rx={2} fill={batteryColour(pct)} />}
      {charging && (
        <Path
          d="M19.5 2.5 L11.5 10 H17 L14.5 15.5 L22.5 8 H17 Z"
          fill="#ffffff"
          stroke="#0b1116"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

export function BatteryBadge() {
  const { t } = useI18n();
  const { status } = useRobot();
  const inset = useSafeAreaInsets();
  if (status?.battery == null) return null;
  const pct = Math.round(status.battery);

  return (
    <View
      style={[styles.root, { top: 14 + inset.top, right: 18 + inset.right + 36 + 10 }]}
      accessible
      accessibilityLabel={`${t('battery')} ${pct}%${status.charging ? ` ${t('charging')}` : ''}`}
    >
      <Text style={styles.pct}>{pct}%</Text>
      <BatteryIcon pct={pct} charging={status.charging} width={34} />
    </View>
  );
}

const styles = StyleSheet.create({
  // same height and look as the language button next to it
  root: {
    position: 'absolute',
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(14,20,26,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(160,190,205,0.18)',
  },
  pct: { fontFamily: fonts.semibold, fontSize: 15, color: '#eef2f5' },
});
