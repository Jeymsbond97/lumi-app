// On every screen after the loading screen (style D): the name in dot matrix top left with the state under it,
// top centre the body and arm power (tapping the body enables or disables it; tapping the arm powers it on, enables,
// disables or powers it off; each asks first in ConfirmDialog), and on the right under the battery
// head, waist and lift (only while the head and lift controller answers; no empty placeholders).
// Battery: BatteryBadge, top right.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ARM_TEXT, bodyPoseKnown, setArmEnabled, setArmPower, setBodyEnabled, type ArmState, type Body } from '../lib/api';
import type { TextKey } from '../lib/i18n';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog';
import { clamp, fonts, mono } from './theme';

const NOTE_MS = 2500;
const BUSY_MAX_MS = 8000;

// same colours as the ring on the robot's shoulder in the 3D scene
export const ARM_DOT: Record<ArmState, string> = {
  off: mono.dim,
  disabled: mono.blue,
  enabled: mono.green,
  error: mono.red,
  drag: mono.yellow,
};

const STATE_DOT: Partial<Record<TextKey, string>> = {
  statusReady: mono.green,
  statusMoving: mono.blue,
  statusBaseOffline: mono.red,
};


export function StatusHud() {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  // the state of the part when a switch was sent: its chip spins until the robot reports a different one
  const [sentFrom, setSentFrom] = useState<{ part: 'arm' | 'body'; from: string } | null>(null);
  const [note, setNote] = useState<TextKey | null>(null);
  const [ask, setAsk] = useState<ConfirmRequest | null>(null);
  const closeAsk = useCallback(() => setAsk(null), []);
  const nameSize = clamp(26, 0.07 * h, 56);
  const small = clamp(11, 0.019 * h, 15);
  const arm = status?.armState ?? 'off';
  const body = status?.body ?? null;
  const bodyNow = bodyState(body);
  const busyArm = sentFrom?.part === 'arm' && sentFrom.from === arm;
  const busyBody = sentFrom?.part === 'body' && sentFrom.from === bodyNow;

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  // if the robot never reports the change, the chip stops waiting after a while
  useEffect(() => {
    if (!sentFrom) return;
    const id = setTimeout(() => setSentFrom(null), BUSY_MAX_MS);
    return () => clearTimeout(id);
  }, [sentFrom]);

  const send = (part: 'arm' | 'body', call: Promise<unknown>) => {
    setSentFrom({ part, from: part === 'arm' ? arm : bodyNow });
    call.catch(() => {
      setSentFrom(null);
      setNote('noAnswer');
    });
  };

  // off: power on. Powered: enable or power off. Enabled: disable (powering off goes through disabled first).
  // Free drive and a fault are handled at the arm itself, so the chip only shows them.
  const switchArm = () => {
    if (busyArm || arm === 'drag' || arm === 'error') return;
    Haptics.selectionAsync().catch(() => {});
    const url = connection.baseUrl;
    if (arm === 'off') {
      setAsk({ title: t('armPowerAsk'), choices: [{ text: t('powerOn'), onPress: () => send('arm', setArmPower(url, true)) }] });
    } else if (arm === 'disabled') {
      setAsk({
        title: t('armEnableAsk'),
        choices: [
          { text: t('powerOff'), destructive: true, onPress: () => send('arm', setArmPower(url, false)) },
          { text: t('enable'), onPress: () => send('arm', setArmEnabled(url, true)) },
        ],
      });
    } else {
      setAsk({
        title: t('armDisableAsk'),
        choices: [{ text: t('disable'), destructive: true, onPress: () => send('arm', setArmEnabled(url, false)) }],
      });
    }
  };

  // a silent controller cannot be switched from here, and an older robot API does not say
  const switchBody = () => {
    if (busyBody || (bodyNow !== 'enabled' && bodyNow !== 'disabled')) return;
    Haptics.selectionAsync().catch(() => {});
    const on = bodyNow === 'disabled';
    setAsk({
      title: t(on ? 'bodyEnableAsk' : 'bodyDisableAsk'),
      choices: [{ text: t(on ? 'enable' : 'disable'), destructive: !on, onPress: () => send('body', setBodyEnabled(connection.baseUrl, on)) }],
    });
  };

  return (
    <>
      <View style={[styles.nameBlock, { left: 24 + inset.left, top: 14 + inset.top }]} pointerEvents="none">
        <Text style={[styles.name, { fontSize: nameSize, lineHeight: nameSize * 1.1 }]}>LUMI</Text>
        {status && (
          <View style={[styles.row, { gap: small * 0.6 }]}>
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

      {bodyPoseKnown(body) && (
        <View style={[styles.readings, { right: 24 + inset.right, top: 14 + inset.top + 52 }]} pointerEvents="none">
          <Reading label={t('head')} value={`${Math.round(body.headYawDeg)}°`} size={small} />
          <Reading label={t('waist')} value={`${Math.round(body.waistDeg)}°`} size={small} />
          <Reading label={t('lift')} value={`${Math.round(body.liftMm)} mm`} size={small} />
        </View>
      )}

      <ConfirmDialog request={ask} onClose={closeAsk} />
    </>
  );
}

type BodyState = 'off' | 'on' | 'disabled' | 'enabled';

/** off: the controller does not answer; on: it answers but the robot's API does not say whether it is enabled. */
function bodyState(body: Body | null): BodyState {
  if (!body) return 'off';
  if (body.enabled === null) return 'on';
  return body.enabled ? 'enabled' : 'disabled';
}

const BODY_TEXT: Record<BodyState, TextKey> = { off: 'bodyOff', on: 'bodyOn', disabled: 'bodyDisabled', enabled: 'bodyEnabled' };
const BODY_DOT: Record<BodyState, string> = { off: mono.dim, on: mono.green, disabled: mono.blue, enabled: mono.green };

function Chip({ on, colour, text, size, busy }: { on: boolean; colour: string; text: string; size: number; busy?: boolean }) {
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

function Reading({ label, value, size }: { label: string; value: string; size: number }) {
  return (
    <View style={[styles.row, { gap: size * 0.6 }]}>
      <Text style={[styles.label, { fontSize: size }]}>{label}</Text>
      <Text style={[styles.value, { fontSize: size }]}>{value}</Text>
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
  value: { fontFamily: fonts.monoBold, color: mono.text, ...shadow },
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
  readings: { position: 'absolute', alignItems: 'flex-end', gap: 6 },
});
