// Asks for a name (a marker), in the same dark look as ConfirmDialog. It sits under STOP, like that dialog.
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useI18n, type TextKey } from '../lib/i18n';
import { clamp, fonts, mono } from './theme';

interface Props {
  open: boolean;
  title: TextKey;
  rule: TextKey;
  initial: string;
  valid: (name: string) => boolean;
  onDone: (name: string) => void;
  onClose: () => void;
}

export function NameDialog(props: Props) {
  // mounted anew each time it opens, so the name starts from `initial` again
  return props.open ? <Ask {...props} /> : null;
}

function Ask({ title, rule, initial, valid, onDone, onClose }: Props) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const size = clamp(13, 0.022 * height, 17);
  const [name, setName] = useState(initial);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const ok = valid(name);
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          entering={ZoomIn.duration(160)}
          style={[styles.card, { width: Math.min(420, width - 48), padding: size * 1.4, gap: size }]}
        >
          <Text style={[styles.title, { fontSize: size }]}>{t(title)}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={50}
            onSubmitEditing={() => ok && onDone(name)}
            style={[styles.input, { fontSize: size * 1.1, paddingVertical: size * 0.6 }, !ok && styles.inputBad]}
            placeholderTextColor={mono.dim}
          />
          <Text style={[styles.rule, { fontSize: size * 0.8 }, !ok && styles.ruleBad]}>{t(rule)}</Text>
          <View style={[styles.buttons, { gap: size * 0.7 }]}>
            <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={[styles.buttonText, { fontSize: size * 0.9, color: mono.soft }]}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => ok && onDone(name)}
              disabled={!ok}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ok }}
              style={({ pressed }) => [styles.button, styles.buttonOn, !ok && styles.buttonOff, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, { fontSize: size * 0.9, color: mono.green }]}>{t('mapSave')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth: 1, borderColor: mono.dim, backgroundColor: 'rgba(8,8,8,0.96)' },
  title: { fontFamily: fonts.mono, color: mono.text },
  input: {
    fontFamily: fonts.monoBold,
    color: mono.text,
    borderBottomWidth: 1.5,
    borderBottomColor: mono.text,
  },
  inputBad: { borderBottomColor: mono.red },
  rule: { fontFamily: fonts.mono, color: mono.soft },
  ruleBad: { color: mono.red },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end' },
  button: { borderRadius: 999, borderWidth: 1.5, borderColor: mono.dim, paddingHorizontal: 16, paddingVertical: 9 },
  buttonOn: { borderColor: mono.green },
  buttonOff: { opacity: 0.4 },
  buttonText: { fontFamily: fonts.monoBold, letterSpacing: 1, textTransform: 'uppercase' },
  pressed: { opacity: 0.6 },
});
