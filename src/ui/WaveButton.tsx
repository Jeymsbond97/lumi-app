// Home's WAVE (owner, 2026-11-20): Lumi waves its hand, the same as COMMANDS > WAVE (POST /arm/wave); with Greeter
// or Patrol on the robot also says a hello. Only the hand icon, on the left edge a little above the modes: the camera
// tab on the right edge, mirrored (same size and glass). Where a short screen (a phone on its side) has no room there,
// it is a rounded square right of STOP instead.
// A tap waves at once, without asking (owner, 2026-11-20; COMMANDS > WAVE still asks). It is dimmed while the arm is not enabled (a tap then says so), and shows a spinner
// until the wave has ended; a refusal or no answer shows under it for a moment.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { blocked, reasonKey, send, toOutcome, waveRequest } from '../lib/commands';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { CommandIcon } from './CommandIcon';
import { modesBox } from './ModesPanel';
import { nameBlockBottom } from './StatusHud';
import { stopSize } from './StopButton';
import { clamp, fonts, mono } from './theme';

const NOTE_MS = 3500; // a refusal stays this long
const GAP = 18; // between the button and the modes above which it sits, and the name block

export function WaveButton() {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  const small = clamp(11, 0.019 * h, 15);
  // the camera tab's size (lib/camera cameraLayout)
  const tabH = clamp(44, 0.07 * h, 56);
  const tabW = Math.round(tabH * 0.85);

  // on the left edge above the modes when the room between them and the name allows it, else right of STOP
  const modes = modesBox(h, inset.bottom);
  const aboveModes = modes.bottom + modes.height + GAP;
  const edge = h - aboveModes - tabH >= nameBlockBottom(h, inset.top) + GAP;
  const stop = stopSize(h);
  const place = edge
    ? { left: 0, bottom: aboveModes }
    : { left: 24 + inset.left + stop * 1.3 + 12, bottom: 18 + inset.bottom + (stop - tabH) / 2 };

  const why = blocked(['arm'], { modes: null, armOn: status?.armState === 'enabled', holding: null });

  const wave = () => {
    setBusy(true);
    send(connection.baseUrl, waveRequest).then((reply) => {
      setBusy(false);
      const out = toOutcome(reply, true);
      if (out.phase === 'lost') setNote(t('noAnswer'));
      else if (out.phase === 'refused') {
        const k = reasonKey(out.reason);
        setNote(k ? t(k) : (out.reason ?? t('cmdRefused')));
      }
    });
  };

  const tap = () => {
    if (busy) return;
    if (why) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setNote(t(why));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    wave();
  };

  if (!status) return null;
  return (
    <>
      <View style={[styles.root, place]} pointerEvents="box-none">
        <Pressable
          onPress={tap}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('cmdWave')}
          accessibilityState={{ busy, disabled: !!why }}
          style={({ pressed }) => [
            styles.tab,
            edge
              ? { width: tabW + inset.left, height: tabH, paddingLeft: inset.left }
              : [styles.free, { width: tabH, height: tabH }],
            busy && styles.busy,
            !!why && styles.dim,
            pressed && styles.pressed,
          ]}
        >
          {busy ? <ActivityIndicator size="small" color={mono.text} /> : <CommandIcon name="wave" size={tabH * 0.45} color={mono.text} />}
        </Pressable>
        {note && (
          <Text style={[styles.note, { fontSize: small, marginLeft: edge ? 12 + inset.left : 0 }]} numberOfLines={2}>
            {note}
          </Text>
        )}
      </View>
    </>
  );
}

// the camera tab's glass (CameraPanel), open to the left edge
const glass = { backgroundColor: 'rgba(8,8,8,0.92)', borderColor: '#333', borderWidth: 1, borderLeftWidth: 0 };

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-start', gap: 8 },
  tab: { alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 14, borderBottomRightRadius: 14, ...glass },
  // right of STOP, away from the edge: round and framed on every side
  free: { borderRadius: 14, borderLeftWidth: 1 },
  busy: { borderColor: mono.green },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  note: {
    fontFamily: fonts.mono,
    color: mono.yellow,
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
});
