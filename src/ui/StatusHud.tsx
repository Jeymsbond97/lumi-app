// On every screen after the loading screen: the name top left, and top centre one glass bar with the state, the arm,
// and head, waist and lift (these only while the head and lift controller answers; no empty placeholders).
// Battery: BatteryBadge, top right.
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ARM_TEXT, type ArmState } from '../lib/api';
import type { TextKey } from '../lib/i18n';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts } from './theme';

// same colours as the ring on the robot's shoulder in the 3D scene
export const ARM_DOT: Record<ArmState, string> = {
  off: '#2a2f35',
  disabled: '#2f8cff',
  enabled: '#33d17a',
  error: '#ff5a52',
  drag: '#ffcf33',
};

const STATE_DOT: Partial<Record<TextKey, string>> = {
  statusReady: '#7fe0a6',
  statusMoving: '#7fd6ff',
  statusBaseOffline: '#ff5a52',
};

export function StatusHud() {
  const { t } = useI18n();
  const { status } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const nameSize = clamp(18, 0.044 * h, 36);
  const rowSize = clamp(11, 0.021 * h, 18);
  const smallSize = clamp(11, 0.019 * h, 16);
  const arm = status?.armState ?? 'off';

  const body = status?.body;
  const sep = <View style={[styles.sep, { height: smallSize * 1.1 }]} />;

  return (
    <>
      <Text
        style={[styles.name, { fontSize: nameSize, position: 'absolute', left: 24 + inset.left, top: 18 + inset.top }]}
        pointerEvents="none"
      >
        Lumi
      </Text>
      {status && (
        <View style={[styles.barRow, { top: 14 + inset.top }]} pointerEvents="none">
          <View style={[styles.bar, { gap: rowSize * 0.75, paddingHorizontal: rowSize, height: 36 }]}>
            <View style={[styles.row, { gap: 7 }]}>
              <View style={[styles.dot, { width: smallSize * 0.55, height: smallSize * 0.55, backgroundColor: STATE_DOT[status.status] }]} />
              <Text style={[styles.strong, { fontSize: smallSize }]}>{t(status.status)}</Text>
            </View>
            {sep}
            <View style={[styles.row, { gap: 7 }]}>
              <View style={[styles.dot, { width: smallSize * 0.55, height: smallSize * 0.55, backgroundColor: ARM_DOT[arm] }]} />
              <Text style={[styles.soft, { fontSize: smallSize }]}>{t(ARM_TEXT[arm])}</Text>
            </View>
            {body && (
              <>
                {sep}
                <Reading label={t('head')} value={`${Math.round(body.headYawDeg)}°`} size={smallSize} />
                <Reading label={t('waist')} value={`${Math.round(body.waistDeg)}°`} size={smallSize} />
                <Reading label={t('lift')} value={`${Math.round(body.liftMm)} mm`} size={smallSize} />
              </>
            )}
          </View>
        </View>
      )}
    </>
  );
}

function Reading({ label, value, size }: { label: string; value: string; size: number }) {
  return (
    <View style={[styles.row, { gap: 6 }]}>
      <Text style={[styles.soft, { fontSize: size }]}>{label}</Text>
      <Text style={[styles.strong, { fontSize: size }]}>{value}</Text>
    </View>
  );
}

// keeps small words readable over the bright planet and skyline behind them
const shadow = { textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 6 };

const styles = StyleSheet.create({
  name: { fontFamily: fonts.title, color: '#eef2f5', letterSpacing: 0.5 },
  barRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // same glass as the language and battery buttons in the same row
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(14,20,26,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(160,190,205,0.18)',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  strong: { fontFamily: fonts.semibold, color: '#eef2f5' },
  soft: { fontFamily: fonts.body, color: '#8fa0ab', ...shadow },
  sep: { width: 1, backgroundColor: 'rgba(160,190,205,0.2)' },
  dot: { borderRadius: 99 },
});
