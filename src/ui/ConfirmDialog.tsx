// Asks before a switch that moves power or servos (style D), instead of the system's white alert.
// It is drawn inside the controls layer under STOP, so STOP stays reachable while it is open.
// A tap outside the card or the Android back button cancels.
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSteadyWindow } from '../lib/steadyWindow';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useI18n } from '../lib/i18n';
import { clamp, fonts, mono } from './theme';

export type ConfirmChoice = { text: string; destructive?: boolean; onPress: () => void };
export type ConfirmRequest = { title: string; choices: ConfirmChoice[] };

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const { t } = useI18n();
  const { width, height } = useSteadyWindow();
  const size = clamp(13, 0.022 * height, 17);

  useEffect(() => {
    if (!request) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [request, onClose]);

  if (!request) return null;
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          entering={ZoomIn.duration(160)}
          accessibilityViewIsModal
          style={[styles.card, { width: Math.min(440, width - 48), padding: size * 1.4, gap: size * 1.4 }]}
        >
          <Text style={[styles.title, { fontSize: size, lineHeight: size * 1.5 }]}>{request.title}</Text>
          <View style={[styles.buttons, { gap: size * 0.7 }]}>
            <Button text={t('cancel')} size={size} onPress={onClose} muted />
            {request.choices.map((c) => (
              <Button
                key={c.text}
                text={c.text}
                size={size}
                destructive={c.destructive}
                onPress={() => {
                  onClose();
                  c.onPress();
                }}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function Button({ text, size, onPress, destructive, muted }: { text: string; size: number; onPress: () => void; destructive?: boolean; muted?: boolean }) {
  const colour = destructive ? mono.red : muted ? mono.soft : mono.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        { height: size * 2.8, paddingHorizontal: size * 1.2, borderColor: muted ? mono.dim : colour },
        destructive && styles.buttonDestructive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { fontSize: size * 0.9, color: colour }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mono.dim,
    backgroundColor: 'rgba(8,8,8,0.96)',
  },
  title: { fontFamily: fonts.mono, color: mono.text },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  button: { borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  buttonDestructive: { backgroundColor: 'rgba(255,45,45,0.12)' },
  buttonText: { fontFamily: fonts.monoBold, letterSpacing: 1, textTransform: 'uppercase' },
  pressed: { opacity: 0.6 },
});
