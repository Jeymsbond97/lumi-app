// Loading screen: Lumi's glass visor; the eyes look round while the app searches for the robot
// and look at you once it answers. Ported from .superpowers/preview/loading.html.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSteadyWindow } from '../lib/steadyWindow';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { clamp, colors, fonts } from './theme';
import { useI18n } from '../lib/i18n';

const DOTS = ['', '.', '..', '...', '..', '.'];

function useLoop(durationMs: number) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false);
  }, [p, durationMs]);
  return p;
}

function Eye({ size, look, locked }: { size: number; look: SharedValue<number>; locked: boolean }) {
  const pupil = size * 0.46;
  const style = useAnimatedStyle(() => {
    if (locked) return { transform: [{ translateX: 0 }, { scale: 1.15 }] };
    const p = look.value;
    const x = interpolate(p, [0, 0.12, 0.25, 0.35, 0.5, 0.6, 0.75, 1], [0, 0, -1, -1, 1, 1, 0, 0]);
    const s = interpolate(p, [0, 0.6, 0.75, 1], [1, 1, 1.15, 1.15]);
    return { transform: [{ translateX: x * pupil * 0.38 }, { scale: s }] };
  });

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="lens" cx="38%" cy="35%" r="50%">
            <Stop offset="0" stopColor="#3b4249" />
            <Stop offset="0.45" stopColor="#121417" />
            <Stop offset="0.7" stopColor="#000" />
            <Stop offset="1" stopColor="#000" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="url(#lens)" stroke="#1c1f23" strokeWidth={2} />
      </Svg>
      <Animated.View style={[styles.pupil, { width: pupil, height: pupil, left: (size - pupil) / 2, top: (size - pupil) / 2 }, style]}>
        <Svg width={pupil} height={pupil}>
          <Defs>
            <RadialGradient id="pupil" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#b8f5cf" />
              <Stop offset="0.5" stopColor={colors.green} />
              <Stop offset="0.72" stopColor={colors.green} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={pupil} height={pupil} fill="url(#pupil)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const ARCS = [
  'M8.6 16a5 5 0 0 1 6.8 0',
  'M5.5 12.5a9.5 9.5 0 0 1 13 0',
  'M2.5 9a14 14 0 0 1 19 0',
];

function WifiArc({ d, index, wave }: { d: string; index: number; wave: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const ph = (wave.value - index * (0.2 / 1.8) + 1) % 1;
    return { opacity: interpolate(ph, [0, 0.15, 0.35, 0.7, 1], [0.25, 0.25, 1, 1, 0.25]) };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d={d} stroke={colors.mint} strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

export function ConnectingView({ connected }: { connected: boolean }) {
  const { t } = useI18n();
  const { width: w, height: h } = useSteadyWindow();
  const look = useLoop(4000);
  const wave = useLoop(1800);
  const [dot, setDot] = useState(0);

  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => setDot((d) => (d + 1) % DOTS.length), 400);
    return () => clearInterval(id);
  }, [connected]);

  const glassW = Math.min(0.56 * w, 0.98 * h);
  const glassH = Math.min(0.32 * h, 0.175 * w);
  const eye = glassW * 0.15;
  const msgSize = clamp(14, 0.026 * h, 22);
  const noteSize = clamp(12, 0.021 * h, 17);

  return (
    <View style={styles.root}>
      {/* soft green glow rising from the floor */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="bg" cx={w / 2} cy={h * 1.2} rx={w * 0.72} ry={h * 1.25} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.floorGreen} />
            <Stop offset="0.55" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.bg} />
          </RadialGradient>
          <RadialGradient id="floor" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.mint} stopOpacity={0.28} />
            <Stop offset="0.7" stopColor={colors.mint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#bg)" />
        <Ellipse cx={w / 2} cy={h * 0.945} rx={w * 0.23} ry={h * 0.015} fill="url(#floor)" />
      </Svg>

      <View style={[styles.center, { paddingBottom: h * 0.09 }]}>
        <LinearGradient
          colors={['#2a2e33', '#0b0c0e', '#050506']}
          locations={[0, 0.55, 1]}
          style={{ width: glassW, height: glassH, borderRadius: glassH / 2, overflow: 'hidden' }}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
            style={{ position: 'absolute', left: '8%', right: '8%', top: '6%', height: '30%', borderRadius: glassH }}
          />
          <View style={[styles.eye, { left: glassW * 0.24, top: (glassH - eye) / 2 }]}>
            <Eye size={eye} look={look} locked={connected} />
          </View>
          <View style={[styles.eye, { right: glassW * 0.24, top: (glassH - eye) / 2 }]}>
            <Eye size={eye} look={look} locked={connected} />
          </View>
        </LinearGradient>

        <View style={styles.msgRow}>
          {/* empty box as wide as the dots keeps the words centred while the dots change */}
          <Text style={[styles.dots, { fontSize: msgSize, width: msgSize * 1.4 }]} />
          <Text style={[styles.msg, { fontSize: msgSize }]}>{connected ? t('connected') : t('connecting')}</Text>
          <Text style={[styles.msg, styles.dots, { fontSize: msgSize, width: msgSize * 1.4 }]}>
            {connected ? '' : DOTS[dot]}
          </Text>
        </View>
      </View>

      {!connected && (
        <View style={[styles.noteWrap, { bottom: h * 0.08 }]}>
          <LinearGradient colors={['rgba(24,34,29,0.78)', 'rgba(12,17,15,0.78)']} style={styles.note}>
            <View style={styles.wifi}>
              <View style={{ width: 16, height: 16 }}>
                {ARCS.map((d, i) => (
                  <WifiArc key={d} d={d} index={i} wave={wave} />
                ))}
                <Svg width={16} height={16} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
                  <Circle cx={12} cy={19.2} r={1.5} fill={colors.mint} />
                </Svg>
              </View>
            </View>
            <Text style={[styles.noteText, { fontSize: noteSize }]}>
              {t('connectNoteBefore')}
              <Text style={styles.noteBold}>{t('connectNoteWifi')}</Text>
              {t('connectNoteAfter')}
            </Text>
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  eye: { position: 'absolute' },
  pupil: { position: 'absolute' },
  msgRow: { flexDirection: 'row', alignItems: 'baseline' },
  msg: { color: colors.text, fontFamily: fonts.medium, letterSpacing: 0.2 },
  dots: { textAlign: 'left' },
  noteWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingLeft: 12,
    paddingRight: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(127,224,166,0.22)',
  },
  wifi: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,224,166,0.12)',
  },
  noteText: { color: colors.textSoft, fontFamily: fonts.body, letterSpacing: 0.2 },
  noteBold: { color: colors.mintBright, fontFamily: fonts.semibold },
});
