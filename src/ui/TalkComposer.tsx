// Talk's box: words typed for Lumi, then SAY (said as they are) or ASK (Lumi answers); and the quick words, said at
// once on a tap in the voice's language (English or Korean, whatever the app shows). Not focused on its own, so a
// phone's keyboard comes up only when someone taps the line.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LANGS, textOf, useI18n, type Lang } from '../lib/i18n';
import { PHRASES } from '../lib/talk';
import { fonts, mono } from './theme';

const MAX_CHARS = 300;

function Button({ text, size, onPress, disabled, grow }: { text: string; size: number; onPress: () => void; disabled?: boolean; grow?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        grow && styles.grow,
        { paddingHorizontal: size * 1.1, minHeight: size * 2.9 },
        disabled && styles.off,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { fontSize: size * 0.9 }]}>{text}</Text>
    </Pressable>
  );
}

export function TalkComposer({
  size,
  stacked,
  onSay,
  onAsk,
}: {
  size: number;
  /** The buttons under the field (a narrow column) instead of beside it. */
  stacked: boolean;
  onSay: (text: string) => void;
  onAsk: (text: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const words = text.trim();
  const go = (f: (s: string) => void) => {
    if (!words) return;
    f(words);
    setText('');
  };

  const input = (
    <TextInput
      value={text}
      onChangeText={setText}
      maxLength={MAX_CHARS}
      placeholder={t('talkPlaceholder')}
      placeholderTextColor={mono.dim}
      returnKeyType="send"
      onSubmitEditing={() => go(onSay)}
      style={[styles.input, { fontSize: size * 0.95, paddingVertical: size * 0.55, paddingHorizontal: size * 0.8 }, !stacked && styles.grow]}
    />
  );
  const buttons = (
    <>
      <Button text={t('cmdSay')} size={size} onPress={() => go(onSay)} disabled={!words} grow={stacked} />
      <Button text={t('cmdAsk')} size={size} onPress={() => go(onAsk)} disabled={!words} grow={stacked} />
    </>
  );
  return stacked ? (
    <View style={{ gap: size * 0.5 }}>
      {input}
      <View style={[styles.row, { gap: size * 0.5 }]}>{buttons}</View>
    </View>
  ) : (
    <View style={[styles.row, { gap: size * 0.5 }]}>
      {input}
      {buttons}
    </View>
  );
}

/** The voice's language and the quick words: one scrolling row, or wrapped in a column. */
export function TalkPhrases({
  size,
  wrap,
  voice,
  onVoice,
  onSay,
}: {
  size: number;
  wrap: boolean;
  voice: Lang;
  onVoice: (l: Lang) => void;
  onSay: (text: string) => void;
}) {
  const { t } = useI18n();
  const chip = { paddingHorizontal: size * 0.8, paddingVertical: size * 0.45 };
  const voices = (
    <View style={[styles.voices, { padding: 3, gap: 2 }]}>
      <Text style={[styles.voiceLabel, { fontSize: size * 0.68, paddingHorizontal: size * 0.5 }]}>{t('talkVoice')}</Text>
      {LANGS.map((l) => {
        const on = l.id === voice;
        return (
          <Pressable
            key={l.id}
            onPress={() => onVoice(l.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            hitSlop={3}
            style={({ pressed }) => [styles.voice, { paddingHorizontal: size * 0.6, paddingVertical: size * 0.3 }, on && styles.voiceOn, pressed && styles.pressed]}
          >
            <Text style={[styles.voiceText, { fontSize: size * 0.75 }, on && styles.voiceTextOn]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const phrases = PHRASES.map((k) => {
    const words = textOf(voice, k);
    return (
      <Pressable
        key={k}
        onPress={() => onSay(words)}
        accessibilityRole="button"
        hitSlop={3}
        style={({ pressed }) => [styles.chip, chip, pressed && styles.pressed]}
      >
        <Text style={[styles.chipText, { fontSize: size * 0.82 }]}>{words}</Text>
      </Pressable>
    );
  });
  if (wrap)
    return (
      <View style={{ gap: size * 0.5 }}>
        <View style={[styles.row, styles.between]}>
          <Text style={[styles.label, { fontSize: size * 0.72 }]}>{t('talkPhrases')}</Text>
          {voices}
        </View>
        <View style={[styles.wrap, { gap: size * 0.45 }]}>{phrases}</View>
      </View>
    );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={[styles.row, { gap: size * 0.45 }]}>
      {voices}
      {phrases}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  grow: { flex: 1 },
  input: {
    fontFamily: fonts.mono,
    color: mono.text,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#0e0f11',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4a4a4a',
    backgroundColor: '#16171a',
  },
  buttonText: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1.2, textTransform: 'uppercase' },
  off: { opacity: 0.38 },
  pressed: { opacity: 0.6 },
  strip: { flexGrow: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  label: { fontFamily: fonts.monoBold, color: mono.soft, letterSpacing: 1.2, textTransform: 'uppercase' },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#333', backgroundColor: 'rgba(8,8,8,0.92)' },
  chipText: { fontFamily: fonts.mono, color: mono.text },
  voices: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#333', backgroundColor: 'rgba(8,8,8,0.92)' },
  voiceLabel: { fontFamily: fonts.mono, color: mono.dim, letterSpacing: 1, textTransform: 'uppercase' },
  voice: { borderRadius: 999 },
  voiceOn: { backgroundColor: 'rgba(255,255,255,0.09)' },
  voiceText: { fontFamily: fonts.mono, color: mono.soft },
  voiceTextOn: { fontFamily: fonts.monoBold, color: mono.text },
});
