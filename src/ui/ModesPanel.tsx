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
import { clamp, fonts } from './theme';

function Switch({ on, size }: { on: boolean; size: number }) {
  return (
    <View style={[styles.track, { width: size * 1.8, height: size, borderRadius: size / 2 }, on && styles.trackOn]}>
      <View
        style={[
          styles.knob,
          { width: size - 6, height: size - 6, borderRadius: (size - 6) / 2, left: on ? size * 1.8 - size + 3 : 3 },
          on && styles.knobOn,
        ]}
      />
    </View>
  );
}

export function ModesPanel() {
  const { t } = useI18n();
  const { connection, modes, setModes } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [failed, setFailed] = useState(false);
  const text = clamp(12, 0.02 * h, 16);
  const sw = clamp(18, 0.03 * h, 24);

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
            <View style={{ width: sw * 1.8, height: sw, justifyContent: 'center' }}>
              <ActivityIndicator size="small" color="#7fe0a6" />
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
    backgroundColor: 'rgba(10,15,20,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(160,190,205,0.14)',
  },
  title: { fontFamily: fonts.medium, color: '#6f818c', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.6 },
  label: { fontFamily: fonts.body, color: '#a9b8c1' },
  labelOn: { fontFamily: fonts.semibold, color: '#eef2f5' },
  track: { backgroundColor: '#1d262d', justifyContent: 'center' },
  trackOn: { backgroundColor: '#1f6b43' },
  knob: { position: 'absolute', backgroundColor: '#6f818c' },
  knobOn: { backgroundColor: '#9ff0bf' },
  error: { fontFamily: fonts.body, color: '#ff8a80', marginTop: 4 },
});
