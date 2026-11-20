// On every screen after the loading screen (style D): the name in dot matrix top left (moving or base offline under it;
// tapping the name opens Home),
// top centre the body and arm power (tapping the body enables or disables it; tapping the arm powers it on, enables,
// disables or powers it off; each asks first in ConfirmDialog). Head, waist and lift are not shown here (owner,
// 2026-11-18): Drive's BODY page shows them.
// Battery: BatteryBadge, top right.
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ARM_TEXT, type ArmState } from '../lib/api';
import type { TextKey } from '../lib/i18n';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { ConfirmDialog } from './ConfirmDialog';
import { clamp, fonts, mono } from './theme';
import { BODY_TEXT, type BodyState, usePowerSwitch } from './usePowerSwitch';

// same colours as the ring on the robot's shoulder in the 3D scene
export const ARM_DOT: Record<ArmState, string> = {
  off: mono.dim,
  disabled: mono.blue,
  enabled: mono.green,
  error: mono.red,
  drag: mono.yellow,
};

const STATE_DOT: Partial<Record<TextKey, string>> = {
  statusMoving: mono.blue,
  statusBaseOffline: mono.red,
};


const nameSizes = (h: number) => ({ nameSize: clamp(26, 0.07 * h, 56), small: clamp(11, 0.019 * h, 15) });

/** The lowest the name block reaches (its state line included) from the screen's top edge. */
export function nameBlockBottom(h: number, insetTop: number) {
  const { nameSize, small } = nameSizes(h);
  return 14 + insetTop + nameSize * 1.1 + 4 + small * 1.4;
}

export function StatusHud() {
  const { t } = useI18n();
  const { status } = useRobot();
  const path = usePathname();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const { arm, body: bodyNow, busyArm, busyBody, switchArm, switchBody, note, ask, closeAsk } = usePowerSwitch();
  const { nameSize, small } = nameSizes(h);

  const goHome = () => {
    if (path === '/home') return;
    Haptics.selectionAsync().catch(() => {});
    router.navigate('/home');
  };

  return (
    <>
      <View style={[styles.nameBlock, { left: 24 + inset.left, top: 14 + inset.top }]} pointerEvents="box-none">
        <Pressable
          onPress={goHome}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={t('tabHome')}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[styles.name, { fontSize: nameSize, lineHeight: nameSize * 1.1 }]}>LUMI</Text>
        </Pressable>
        {/* only a state worth a look: moving or the base offline; plain "ready" is not shown (owner, 2026-11-16) */}
        {status && status.status !== 'statusReady' && (
          <View style={[styles.row, { gap: small * 0.6 }]} pointerEvents="none">
            <View style={[styles.dot, { width: small * 0.6, height: small * 0.6, backgroundColor: STATE_DOT[status.status] }]} />
            <Text style={[styles.label, { fontSize: small }]}>{t(status.status)}</Text>
          </View>
        )}
      </View>

      {status && (
        <View style={[styles.chipRow, { top: 14 + inset.top }]} pointerEvents="box-none">
          <View style={styles.chips} pointerEvents="box-none">
            <Pressable
              onPress={switchBody}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ busy: busyBody }}
              accessibilityLabel={t(BODY_TEXT[bodyNow])}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Chip on={bodyNow !== 'off'} colour={BODY_DOT[bodyNow]} text={t(BODY_TEXT[bodyNow])} size={small} busy={busyBody} />
            </Pressable>
            <Pressable
              onPress={switchArm}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ busy: busyArm }}
              accessibilityLabel={t(ARM_TEXT[arm])}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Chip on={arm !== 'off'} colour={ARM_DOT[arm]} text={t(ARM_TEXT[arm])} size={small} busy={busyArm} />
            </Pressable>
          </View>
          {note && <Text style={[styles.note, { fontSize: small }]}>{t(note)}</Text>}
        </View>
      )}

      <ConfirmDialog request={ask} onClose={closeAsk} />
    </>
  );
}

export const BODY_DOT: Record<BodyState, string> = { off: mono.dim, on: mono.green, disabled: mono.blue, enabled: mono.green };

export function Chip({ on, colour, text, size, busy }: { on: boolean; colour: string; text: string; size: number; busy?: boolean }) {
  const d = size * 0.7;
  return (
    <View style={[styles.chip, { height: size * 2.6, paddingHorizontal: size * 1.1, gap: size * 0.55 }, on && styles.chipOn]}>
      {busy ? (
        <ActivityIndicator size="small" color={mono.text} />
      ) : (
        <View
          style={[
            styles.dot,
            { width: d, height: d },
            on ? { backgroundColor: colour, shadowColor: colour, shadowOpacity: 0.9, shadowRadius: 6 } : styles.dotOff,
          ]}
        />
      )}
      <Text style={[styles.label, { fontSize: size }, on && styles.labelOn]}>{text}</Text>
    </View>
  );
}

// keeps small words readable over the bright planet and skyline behind them
const shadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 };

const styles = StyleSheet.create({
  nameBlock: { position: 'absolute', gap: 4 },
  name: { fontFamily: fonts.dot, color: mono.text, letterSpacing: 3, ...shadow },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1, textTransform: 'uppercase', ...shadow },
  labelOn: { color: mono.text },
  dot: { borderRadius: 99 },
  dotOff: { borderWidth: 1.5, borderColor: mono.soft },
  chipRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: mono.dim,
    backgroundColor: mono.glass,
  },
  chipOn: { borderColor: mono.text },
  pressed: { opacity: 0.6 },
  note: {
    fontFamily: fonts.mono,
    color: mono.yellow,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
});
