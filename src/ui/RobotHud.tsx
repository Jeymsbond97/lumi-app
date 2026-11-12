// Words over the 3D robot: name, state, battery, charging, arm, head / waist / lift, and the touch hints.
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ARM_TEXT, type ArmState, type RobotStatus } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { clamp, fonts } from './theme';

// same colours as the ring on the robot's shoulder in the 3D scene
const ARM_DOT: Record<ArmState, string> = {
  off: '#2a2f35',
  disabled: '#2f8cff',
  enabled: '#33d17a',
  error: '#ff5a52',
  drag: '#ffcf33',
};

// unknown values stay empty: no dash placeholders in UI text (owner's rule)
const dash = '';

export function RobotHud({ status }: { status: RobotStatus | null }) {
  const { t } = useI18n();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const nameSize = clamp(18, 0.044 * h, 36);
  const rowSize = clamp(11, 0.021 * h, 18);
  const smallSize = clamp(11, 0.019 * h, 16);
  const hintSize = clamp(10, 0.017 * h, 15);
  const left = 24 + inset.left;
  const body = status?.body;
  const arm = status?.armState ?? 'off';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: 'absolute', left, top: 18 + inset.top }}>
        <Text style={[styles.name, { fontSize: nameSize }]}>Lumi</Text>
        <View style={[styles.row, { marginTop: rowSize * 0.4, gap: rowSize }]}>
          <Text style={[styles.strong, { fontSize: rowSize }]}>{status ? t(status.status) : dash}</Text>
          {status?.battery != null && <Text style={[styles.soft, { fontSize: rowSize }]}>{Math.round(status.battery)}%</Text>}
          {status && (
            <View style={[styles.chip, status.charging ? styles.chipCharge : styles.chipIdle]}>
              <Text style={[{ fontSize: smallSize, fontFamily: fonts.body }, status.charging ? styles.chargeText : styles.soft]}>
                {status.charging ? t('charging') : t('notCharging')}
              </Text>
            </View>
          )}
          {status && (
            <View style={[styles.chip, styles.chipIdle]}>
              <View style={[styles.dot, { width: smallSize * 0.6, height: smallSize * 0.6, backgroundColor: ARM_DOT[arm] }]} />
              <Text style={[styles.soft, { fontSize: smallSize }]}>{t(ARM_TEXT[arm])}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.live, { left, bottom: 18 + inset.bottom, rowGap: smallSize * 0.4, columnGap: smallSize * 1.3 }]}>
        <View style={{ rowGap: smallSize * 0.4 }}>
          <Text style={[styles.soft, { fontSize: smallSize }]}>{t('head')}</Text>
          <Text style={[styles.soft, { fontSize: smallSize }]}>{t('waist')}</Text>
          <Text style={[styles.soft, { fontSize: smallSize }]}>{t('lift')}</Text>
        </View>
        <View style={{ rowGap: smallSize * 0.4 }}>
          <Text style={[styles.strong, { fontSize: smallSize }]}>{body ? `${Math.round(body.headYawDeg)}°` : dash}</Text>
          <Text style={[styles.strong, { fontSize: smallSize }]}>{body ? `${Math.round(body.waistDeg)}°` : dash}</Text>
          <Text style={[styles.strong, { fontSize: smallSize }]}>{body ? `${Math.round(body.liftMm)} mm` : dash}</Text>
        </View>
      </View>

      <View style={[styles.hint, { right: 24 + inset.right, bottom: 18 + inset.bottom, gap: hintSize * 1.4 }]}>
        <Text style={[styles.hintText, { fontSize: hintSize }]}>{t('dragToTurn')}</Text>
        <Text style={[styles.hintText, { fontSize: hintSize }]}>{t('doubleTapReset')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.title, color: '#eef2f5', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  strong: { fontFamily: fonts.semibold, color: '#eef2f5' },
  soft: { fontFamily: fonts.body, color: '#8fa0ab' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  chipCharge: { borderColor: '#1d4a5e' },
  chipIdle: { borderColor: '#26323a' },
  chargeText: { color: '#7fd6ff' },
  dot: { borderRadius: 99 },
  live: { position: 'absolute', flexDirection: 'row' },
  hint: {
    position: 'absolute',
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,12,0.55)',
  },
  hintText: { fontFamily: fonts.body, color: '#9fb0bb' },
});
