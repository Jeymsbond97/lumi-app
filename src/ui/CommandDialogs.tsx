// The Commands screen's dialogs, in the dark look of ConfirmDialog: a choice (which object, which marker), a text to
// say or ask, and the typed command box (MISSIONS shows it in place, not as a dialog). The dialogs sit in the screen's free middle (between the modes, the task card and
// the Dock) at its top, so a phone's keyboard does not cover it; STOP stays on top of all of them.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useI18n, type TextKey } from '../lib/i18n';
import { reasonKey, send, stepLine, stepText, toParsed, type Parsed } from '../lib/commands';
import { fonts, mono } from './theme';

/** The screen's free area (distances from the screen's edges). */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function Sheet({ box, size, onClose, children }: { box: Box; size: number; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View
        accessibilityViewIsModal
        style={[styles.card, { left: box.left, right: box.right, top: box.top, bottom: box.bottom }]}
        pointerEvents="box-none"
      >
        <View style={[styles.cardInner, { gap: size * 0.9, padding: size * 1.1 }]}>{children}</View>
      </View>
    </Animated.View>
  );
}

function Button({ text, size, onPress, disabled, muted }: { text: string; size: number; onPress: () => void; disabled?: boolean; muted?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        { height: size * 2.6, paddingHorizontal: size * 1.2, borderColor: muted ? mono.dim : mono.text },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { fontSize: size * 0.9, color: muted ? mono.soft : mono.text }]}>{text}</Text>
    </Pressable>
  );
}

function Buttons({ size, children }: { size: number; children: ReactNode }) {
  return <View style={[styles.buttons, { gap: size * 0.7 }]}>{children}</View>;
}

// ---------- a choice ----------
export interface ChoiceOption {
  id: string;
  label: string;
  /** A small mark after the label ("seen now"). */
  note?: string;
}
export interface ChoiceField {
  key: string;
  title: TextKey;
  options: ChoiceOption[];
  /** Shown when there is nothing to choose from. */
  empty?: TextKey;
}

export function ChoiceDialog({
  box,
  size,
  title,
  fields,
  values,
  onChange,
  onDone,
  onClose,
  onPick,
}: {
  box: Box;
  size: number;
  title: string;
  fields: ChoiceField[];
  values: Record<string, string>;
  onChange: (key: string, id: string) => void;
  onDone: () => void;
  onClose: () => void;
  /** One field, started by its tap: no field title, no GO. */
  onPick?: (key: string, id: string) => void;
}) {
  const { t } = useI18n();
  const ready = fields.every((f) => f.options.some((o) => o.id === values[f.key]));
  return (
    <Sheet box={box} size={size} onClose={onClose}>
      <Text style={[styles.title, { fontSize: size * 1.05 }]}>{title}</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={{ gap: size * 0.9 }} keyboardShouldPersistTaps="handled">
        {fields.map((f) => (
          <View key={f.key} style={{ gap: size * 0.45 }}>
            {!onPick && <Text style={[styles.label, { fontSize: size * 0.78 }]}>{t(f.title)}</Text>}
            {f.options.length === 0 && f.empty && <Text style={[styles.soft, { fontSize: size * 0.85 }]}>{t(f.empty)}</Text>}
            <View style={[styles.chips, { gap: size * 0.45 }]}>
              {f.options.map((o) => {
                const on = !onPick && values[f.key] === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => (onPick ? onPick(f.key, o.id) : onChange(f.key, o.id))}
                    hitSlop={3}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      styles.chip,
                      { paddingHorizontal: size * 0.85, paddingVertical: size * 0.45, gap: size * 0.4 },
                      on && styles.chipOn,
                      pressed && styles.pressed,
                    ]}
                  >
                    {on && <View style={[styles.dot, { width: size * 0.45, height: size * 0.45 }]} />}
                    <Text style={[styles.chipText, { fontSize: size * 0.9 }, on && styles.chipTextOn]}>{o.label}</Text>
                    {o.note && <Text style={[styles.note, { fontSize: size * 0.7 }]}>{o.note}</Text>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <Buttons size={size}>
        <Button text={t('cancel')} size={size} onPress={onClose} muted />
        {!onPick && <Button text={t('cmdGo')} size={size} onPress={onDone} disabled={!ready} />}
      </Buttons>
    </Sheet>
  );
}

// ---------- words to say or a question ----------
export function TextDialog({
  box,
  size,
  title,
  placeholder,
  onSend,
  onClose,
  hint,
  suggestions,
}: {
  box: Box;
  size: number;
  title: TextKey;
  placeholder: TextKey;
  onSend: (text: string) => void;
  onClose: () => void;
  /** A line under the field (what Lumi sees, or that it sees nothing). */
  hint?: string;
  /** Words a tap sends at once. */
  suggestions?: string[];
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const ok = text.trim().length > 0;
  return (
    <Sheet box={box} size={size} onClose={onClose}>
      <Text style={[styles.title, { fontSize: size * 1.05 }]}>{t(title)}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        maxLength={300}
        placeholder={t(placeholder)}
        placeholderTextColor={mono.dim}
        returnKeyType="send"
        onSubmitEditing={() => ok && onSend(text.trim())}
        style={[styles.input, { fontSize: size * 1.05, paddingVertical: size * 0.55 }]}
      />
      {hint !== undefined && <Text style={[styles.soft, { fontSize: size * 0.85 }]}>{hint}</Text>}
      {suggestions && suggestions.length > 0 && (
        <View style={[styles.chips, { gap: size * 0.45 }]}>
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => onSend(s)}
              hitSlop={3}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.chip,
                { paddingHorizontal: size * 0.85, paddingVertical: size * 0.45 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, { fontSize: size * 0.9 }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Buttons size={size}>
        <Button text={t('cancel')} size={size} onPress={onClose} muted />
        <Button text={t('cmdSend')} size={size} onPress={() => onSend(text.trim())} disabled={!ok} />
      </Buttons>
    </Sheet>
  );
}

// ---------- a typed command, read the way voice reads it ----------
const READ_AFTER_MS = 600; // typing stops this long: read it again (rules only); Enter reads it with the LLM too

/**
 * Lives in MISSIONS itself, always open (owner, 2026-11-23: no dialog over the task buttons). Not focused on its own,
 * so a phone's keyboard comes up only when the owner taps the line. START hands it over and empties the line.
 */
export function CommandBox({
  size,
  baseUrl,
  examples,
  onStart,
}: {
  size: number;
  baseUrl: string;
  examples: TextKey[];
  onStart: (p: Parsed) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reading, setReading] = useState(false);
  const [lost, setLost] = useState(false);
  const seq = useRef(0);

  const readIt = (words: string, llm: boolean) => {
    const n = ++seq.current;
    if (!words.trim()) {
      setParsed(null);
      setReading(false);
      return;
    }
    setReading(true);
    // /tasks/parse only reads: nothing moves
    send(baseUrl, { path: '/tasks/parse', body: { text: words, llm }, timeoutMs: llm ? 20000 : 8000 }).then((r) => {
      if (n !== seq.current) return; // an older answer arriving late
      setReading(false);
      setLost(!r.ok);
      setParsed(r.ok ? toParsed(r.data) : null);
    });
  };

  useEffect(() => {
    const id = setTimeout(() => readIt(text, false), READ_AFTER_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again only when the words change
  }, [text]);

  const canStart = !!parsed?.action && parsed.problems.length === 0 && !reading;
  return (
    <View style={[styles.cardInner, { gap: size * 0.9, padding: size * 1.1 }]}>
      <Text style={[styles.title, { fontSize: size * 1.05 }]}>{t('cmdType')}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        maxLength={400}
        placeholder={t('cmdTypePlaceholder')}
        placeholderTextColor={mono.dim}
        returnKeyType="go"
        onSubmitEditing={() => readIt(text, true)}
        style={[styles.input, { fontSize: size * 1.05, paddingVertical: size * 0.55 }]}
      />
      <View style={{ gap: size * 0.5 }}>
        {!text.trim() && (
          <>
            <Text style={[styles.soft, { fontSize: size * 0.85 }]}>{t('cmdTypeHint')}</Text>
            <View style={[styles.chips, { gap: size * 0.45 }]}>
              {examples.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setText(t(k))}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.chip, { paddingHorizontal: size * 0.85, paddingVertical: size * 0.45 }, pressed && styles.pressed]}
                >
                  <Text style={[styles.chipText, { fontSize: size * 0.9 }]}>{t(k)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {reading && (
          <View style={[styles.row, { gap: size * 0.5 }]}>
            <ActivityIndicator size="small" color={mono.soft} />
            <Text style={[styles.soft, { fontSize: size * 0.85 }]}>{t('cmdReading')}</Text>
          </View>
        )}
        {!reading && lost && <Text style={[styles.bad, { fontSize: size * 0.85 }]}>{t('noAnswer')}</Text>}
        {!reading && parsed && (
          <>
            {parsed.sentence !== '' && <Text style={[styles.sentence, { fontSize: size }]}>{parsed.sentence}</Text>}
            {parsed.action === 'steps' &&
              parsed.steps.map((s, i) => (
                <View key={i} style={[styles.row, { gap: size * 0.6 }]}>
                  <Text style={[styles.stepNo, { fontSize: size * 0.8, width: size * 1.4 }]}>{i + 1}</Text>
                  <Text style={[styles.step, { fontSize: size * 0.9 }]}>{stepText(stepLine(s), t)}</Text>
                </View>
              ))}
            {parsed.problems.map((p) => {
              const k = reasonKey(p);
              return (
                <Text key={p} style={[styles.bad, { fontSize: size * 0.85 }]}>
                  {k ? t(k) : p}
                </Text>
              );
            })}
            {!parsed.action && parsed.problems.length === 0 && (
              <Text style={[styles.soft, { fontSize: size * 0.85 }]}>{t('cmdNothing')}</Text>
            )}
          </>
        )}
      </View>
      <Buttons size={size}>
        <Button text={t('cmdClear')} size={size} onPress={() => setText('')} disabled={!text} muted />
        <Button
          text={t('cmdStart')}
          size={size}
          onPress={() => {
            if (!parsed) return;
            onStart(parsed);
            setText('');
          }}
          disabled={!canStart}
        />
      </Buttons>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  card: {
    position: 'absolute',
    justifyContent: 'flex-start',
  },
  cardInner: {
    flexShrink: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mono.dim,
    backgroundColor: 'rgba(8,8,8,0.97)',
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  title: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1, textTransform: 'uppercase' },
  label: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1.5, textTransform: 'uppercase' },
  soft: { fontFamily: fonts.mono, color: mono.soft },
  bad: { fontFamily: fonts.mono, color: '#ff8a80' },
  sentence: { fontFamily: fonts.mono, color: mono.text },
  row: { flexDirection: 'row', alignItems: 'center' },
  stepNo: { fontFamily: fonts.monoBold, color: mono.dim, textAlign: 'right' },
  step: { fontFamily: fonts.mono, color: mono.text, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipOn: { borderColor: mono.text, backgroundColor: 'rgba(255,255,255,0.09)' },
  chipText: { fontFamily: fonts.mono, color: mono.soft },
  chipTextOn: { fontFamily: fonts.monoBold, color: mono.text },
  note: { fontFamily: fonts.mono, color: mono.green },
  dot: { borderRadius: 99, backgroundColor: mono.red },
  input: {
    fontFamily: fonts.mono,
    color: mono.text,
    borderBottomWidth: 1.5,
    borderBottomColor: mono.soft,
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  button: { borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.monoBold, letterSpacing: 1, textTransform: 'uppercase' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
