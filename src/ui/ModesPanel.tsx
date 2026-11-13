// Greeter, Patrol and Wave greeting switches on the right, above STOP (the language menu opens over the top right).
// A switch shows what the robot says, not what was tapped: it moves once the robot answers.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MODE_TEXT, MODES, setMode, type Mode } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { stopSize } from './StopButton';
import { clamp, fonts, mono } from './theme';

/** Style D: an empty ring when off, a filled red dot when on. */
function Switch({ on, size }: { on: boolean; size: number }) {
  return <View style={[styles.radio, { width: size, height: size, borderRadius: size / 2 }, on && styles.radioOn]} />;
}

export function ModesPanel() {
  const { t } = useI18n();
  const { connection, modes, setModes } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [failed, setFailed] = useState(false);
  const text = clamp(12, 0.02 * h, 16);
  const sw = clamp(14, 0.024 * h, 18);

  if (!modes) return null;

  const toggle = (m: Mode) => {
    if (busy) return;
    Haptics.selectionAsync().catch(() => {});
    setBusy(m);
    setFailed(false);
    setMode(connection.baseUrl, m, !modes[m])
      .then(setModes, () => setFailed(true))
      .finally(() => setBusy(null));
  };

  return (
    <View
      // room between the panel and STOP for the "Stopped" note
      style={[styles.panel, { right: 18 + inset.right, bottom: 18 + inset.bottom + stopSize(h) + 52 }]}
    >
      <Text style={[styles.title, { fontSize: text * 0.8 }]}>{t('modes')}</Text>
      {MODES.map((m) => (
        <Pressable
          key={m}
          onPress={() => toggle(m)}
          disabled={busy !== null}
          accessibilityRole="switch"
          accessibilityState={{ checked: modes[m], busy: busy === m }}
          accessibilityLabel={t(MODE_TEXT[m])}
          style={({ pressed }) => [styles.row, { paddingVertical: text * 0.55, gap: text }, pressed && styles.pressed]}
        >
          <Text style={[styles.label, { fontSize: text }, modes[m] && styles.labelOn]}>{t(MODE_TEXT[m])}</Text>
          {busy === m ? (
            <View style={{ width: sw, height: sw, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="small" color={mono.text} />
            </View>
          ) : (
            <Switch on={modes[m]} size={sw} />
          )}
        </Pressable>
      ))}
      {failed && <Text style={[styles.error, { fontSize: text * 0.85 }]}>{t('noAnswer')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(232,232,232,0.14)',
  },
  title: { fontFamily: fonts.mono, color: mono.soft, marginBottom: 2, letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.6 },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1, textTransform: 'uppercase' },
  labelOn: { fontFamily: fonts.monoBold, color: mono.text },
  radio: { borderWidth: 1.5, borderColor: mono.text },
  radioOn: { backgroundColor: mono.red, borderColor: mono.red },
  error: { fontFamily: fonts.mono, color: mono.red, marginTop: 4 },
});
