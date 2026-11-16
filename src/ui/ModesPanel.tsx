// Greeter, Patrol, Wave and Welcome switches on the left, well above STOP (panel C, "rails", owner's pick 2026-11-16):
// a thin dashed rail with a dot per mode that glows green when on, the names in the dot font, a small switch beside
// each. Tap the switch, or slide it right to switch on and left to switch off.
// A switch shows what the robot says, not what was tapped: it moves once the robot answers.
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Line } from 'react-native-svg';
import { MODE_TEXT, MODES, setMode, type Mode } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { stopSize } from './StopButton';
import { clamp, fonts, mono } from './theme';

/** A slide this far (px) sets the switch to its side; less is a tap, which flips it. */
const SLIDE_PX = 12;
/** Room between the panel and STOP: STOP's wave grows to 1.45 times its size, and the "Stopped" note sits there. */
const ABOVE_STOP = 100;

function Toggle({ on, w }: { on: boolean; w: number }) {
  const h = w * 0.55;
  const k = h - 6;
  return (
    <View style={[styles.track, { width: w, height: h, borderRadius: h / 2 }, on && styles.trackOn]}>
      <View
        style={[
          styles.knob,
          { width: k, height: k, borderRadius: k / 2, transform: [{ translateX: on ? w - k - 6 : 0 }] },
          on && styles.knobOn,
        ]}
      />
    </View>
  );
}

export function ModesPanel() {
  const { t, lang } = useI18n();
  const { connection, modes, setModes, status } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [failed, setFailed] = useState(false);
  const startX = useRef(0);
  const text = clamp(13, 0.024 * h, 18);
  const sw = clamp(36, 0.06 * h, 46);
  const rowH = sw * 0.55 + text * 0.9;

  if (!modes) return null;

  // Welcome is the home mode: it can be switched on only while Lumi stands on its charger (off always works)
  const locked = (m: Mode) => m === 'welcome' && !modes.welcome && !status?.charging;

  const set = (m: Mode, on: boolean) => {
    if (busy || on === modes[m] || (on && locked(m))) return;
    Haptics.selectionAsync().catch(() => {});
    setBusy(m);
    setFailed(false);
    setMode(connection.baseUrl, m, on)
      .then(setModes, () => setFailed(true))
      .finally(() => setBusy(null));
  };

  const onRelease = (m: Mode) => (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - startX.current;
    set(m, Math.abs(dx) < SLIDE_PX ? !modes[m] : dx > 0);
  };

  const railH = rowH * MODES.length;
  return (
    <View style={[styles.panel, { left: 26 + inset.left, bottom: 18 + inset.bottom + stopSize(h) + ABOVE_STOP }]}>
      <Svg width={2} height={railH} style={styles.rail} pointerEvents="none">
        <Line x1={1} y1={0} x2={1} y2={railH} stroke={mono.dim} strokeWidth={1} strokeDasharray="3 4" />
      </Svg>
      {MODES.map((m) => {
        const on = modes[m];
        return (
          <View key={m} style={[styles.row, { height: rowH, gap: text * 0.8 }, locked(m) && styles.locked]}>
            <View style={[styles.dot, on && styles.dotOn]} />
            {/* the dot font has no Hangul: Korean uses the system font, bold */}
            <Text
              style={[lang === 'en' ? styles.label : styles.labelSystem, { fontSize: text, minWidth: text * 6.4 }, on && styles.labelOn]}
            >
              {t(MODE_TEXT[m])}
            </Text>
            <View
              onStartShouldSetResponder={() => busy === null}
              onMoveShouldSetResponder={() => busy === null}
              onResponderGrant={(e) => {
                startX.current = e.nativeEvent.pageX;
              }}
              onResponderRelease={onRelease(m)}
              hitSlop={10}
              accessible
              accessibilityRole="switch"
              accessibilityState={{ checked: on, busy: busy === m, disabled: locked(m) }}
              accessibilityHint={locked(m) ? t('welcomeOnCharger') : undefined}
              accessibilityLabel={t(MODE_TEXT[m])}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && set(m, !on)}
            >
              {busy === m ? (
                <View style={{ width: sw, height: sw * 0.55, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={mono.text} />
                </View>
              ) : (
                <Toggle on={on} w={sw} />
              )}
            </View>
          </View>
        );
      })}
      {failed && <Text style={[styles.error, { fontSize: text * 0.8 }]}>{t('noAnswer')}</Text>}
    </View>
  );
}

// keeps the words readable over the bright 3D scene without a box behind them
const shadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 };

const styles = StyleSheet.create({
  panel: { position: 'absolute', paddingLeft: 16 },
  rail: { position: 'absolute', left: 0, top: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  locked: { opacity: 0.35 },
  dot: {
    position: 'absolute',
    left: -21,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: mono.soft,
    backgroundColor: '#0a0b0d',
  },
  dotOn: {
    backgroundColor: mono.green,
    borderColor: mono.green,
    shadowColor: mono.green,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  label: { fontFamily: fonts.dot, color: mono.soft, letterSpacing: 2, ...shadow },
  labelSystem: { fontWeight: '800', color: mono.soft, ...shadow },
  labelOn: { color: mono.text },
  track: { justifyContent: 'center', paddingHorizontal: 3, backgroundColor: '#222', borderWidth: 1, borderColor: '#444' },
  trackOn: { backgroundColor: 'rgba(61,255,139,0.2)', borderColor: mono.green },
  knob: { backgroundColor: mono.soft },
  knobOn: { backgroundColor: mono.green },
  error: { fontFamily: fonts.mono, color: mono.red, marginTop: 4, ...shadow },
});
