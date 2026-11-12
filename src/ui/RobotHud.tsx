// Home screen touch hints over the 3D robot, bottom centre.
// (State, arm, head, waist and lift are in StatusHud at the top; the joystick and STOP keep the bottom corners.)
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../lib/i18n';
import { clamp, fonts } from './theme';

export function RobotHud() {
  const { t } = useI18n();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const hintSize = clamp(10, 0.017 * h, 15);

  return (
    <View style={[styles.hintRow, { bottom: 18 + inset.bottom }]} pointerEvents="none">
      <View style={[styles.hint, { gap: hintSize * 1.4 }]}>
        <Text style={[styles.hintText, { fontSize: hintSize }]}>{t('dragToTurn')}</Text>
        <Text style={[styles.hintText, { fontSize: hintSize }]}>{t('doubleTapReset')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hintRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,12,0.55)',
  },
  hintText: { fontFamily: fonts.body, color: '#9fb0bb' },
});
