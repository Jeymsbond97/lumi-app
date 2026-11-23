// The Commands screen's dialogs, in the dark look of ConfirmDialog: a choice (which object, which marker), a text to
// say or ask, and the typed command box (MISSIONS shows it in place, not as a dialog). A choice opens as a card in the
// screen's middle with its options as tiles (owner, 2026-11-23); a text sits in the free middle at its top, so a
// phone's keyboard does not cover it. Every footer has two buttons of one size. STOP stays on top of all of them.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useI18n, type TextKey } from '../lib/i18n';
import { reasonKey, send, stepLine, stepText, toParsed, type LookDir, type Parsed, type TurnWay } from '../lib/commands';
import Svg, { Path } from 'react-native-svg';
import { CommandIcon, type CommandIconName } from './CommandIcon';
import { clamp, fonts, mono } from './theme';

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

function Button({
  text,
  size,
  onPress,
  disabled,
  muted,
  primary,
}: {
  text: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
  /** Filled white: the one button the card is for (MISSIONS' START). */
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        { height: size * 2.6, minWidth: size * 8.5, paddingHorizontal: size * 1.2, borderColor: muted ? mono.dim : mono.text },
        primary && !disabled && styles.primary,
        disabled && (primary ? styles.primaryOff : styles.disabled),
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { fontSize: size * 0.9, color: primary && !disabled ? '#0a0a0a' : muted ? mono.soft : mono.text }]}>{text}</Text>
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
  /** Drawn on the option's tile (the charger's bolt, Here). */
  icon?: CommandIconName;
  /** A row of its own across the card, above the others (the charger, Here). */
  featured?: boolean;
}
export interface ChoiceField {
  key: string;
  title: TextKey;
  options: ChoiceOption[];
  /** Shown when there is nothing to choose from. */
  empty?: TextKey;
  /** Many short names (a map's markers): small tiles in more columns, the name in the middle. */
  grid?: boolean;
}

export function ChoiceDialog({
  size,
  title,
  fields,
  values,
  onChange,
  onDone,
  onClose,
  onPick,
}: {
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
  const { width: w, height: h } = useWindowDimensions();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);
  const ready = fields.every((f) => f.options.some((o) => o.id === values[f.key]));

  // a card in the middle of the screen, its options as tiles in even columns
  const cardW = Math.min(w - 32, clamp(320, 0.6 * w, size * 44));
  const pad = size * 1.3;
  const gap = size * 0.6;
  const inner = cardW - 2 * pad;
  const colsFor = (min: number, lo: number, hi: number) => clamp(lo, Math.floor((inner + gap) / (min + gap)), hi);
  const widthFor = (cols: number) => Math.floor((inner - gap * (cols - 1)) / cols);
  const tileW = widthFor(colsFor(size * 9.5, 2, 4));
  const gridW = widthFor(colsFor(size * 6.2, 3, 7));

  const option = (f: ChoiceField, o: ChoiceOption, width: number, small: boolean) => {
    const on = !onPick && values[f.key] === o.id;
    return (
      <Pressable
        key={o.id}
        onPress={() => (onPick ? onPick(f.key, o.id) : onChange(f.key, o.id))}
        hitSlop={2}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={({ pressed }) => [
          styles.option,
          small
            ? [styles.optionSmall, { width, height: size * 2.9, paddingHorizontal: size * 0.4 }]
            : { width, minHeight: size * 3.2, paddingHorizontal: size * 0.9, paddingVertical: size * 0.6, gap: size * 0.6 },
          on && styles.optionOn,
          pressed && styles.pressed,
        ]}
      >
        {o.icon && <CommandIcon name={o.icon} size={size * 1.2} color={on ? ON_TEXT : mono.soft} />}
        <View style={small ? styles.optionWordsSmall : styles.optionWords}>
          <Text
            style={[small ? styles.optionTextSmall : styles.optionText, { fontSize: size * 0.92 }, on && styles.optionTextOn]}
            numberOfLines={small ? 1 : 2}
          >
            {o.label}
          </Text>
          {o.note && <Text style={[styles.note, { fontSize: size * 0.7 }, on && styles.optionTextOn]}>{o.note}</Text>}
        </View>
      </Pressable>
    );
  };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center]} entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdropDeep]} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View accessibilityViewIsModal style={[styles.modal, { width: cardW, maxHeight: h * 0.84, padding: pad, gap: size * 1.1 }]}>
        <Text style={[styles.title, { fontSize: size * 1.15 }]}>{title}</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={{ gap: size * 1.2 }} keyboardShouldPersistTaps="handled">
          {fields.map((f) => {
            const top = f.options.filter((o) => o.featured);
            const rest = f.options.filter((o) => !o.featured);
            return (
              <View key={f.key} style={{ gap: size * 0.6 }}>
                {!onPick && <Text style={[styles.label, { fontSize: size * 0.78 }]}>{t(f.title)}</Text>}
                {f.options.length === 0 && f.empty && <Text style={[styles.soft, { fontSize: size * 0.85 }]}>{t(f.empty)}</Text>}
                {top.length > 0 && <View style={[styles.chips, { gap }]}>{top.map((o) => option(f, o, top.length > 1 ? widthFor(2) : inner, false))}</View>}
                {rest.length > 0 && (
                  <View style={[styles.chips, { gap }]}>{rest.map((o) => option(f, o, f.grid ? gridW : tileW, !!f.grid))}</View>
                )}
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.footer, { gap: size * 0.7 }]}>
          <View style={styles.footerButton}>
            <Button text={t('cancel')} size={size} onPress={onClose} muted />
          </View>
          {!onPick && (
            <View style={styles.footerButton}>
              <Button text={t('cmdGo')} size={size} onPress={onDone} disabled={!ready} primary />
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ---------- LOOK and TURN: pads ----------
/** An arrow's path pointing up in a 24 box; turned for the other ways. */
const ARROW = 'M12 5 L12 19 M6 11 L12 5 L18 11';
const TURN_OF: Record<Exclude<LookDir, 'centre'>, number> = { up: 0, right: 90, down: 180, left: 270 };
/** Round arrows: a turn to the left (counter clockwise) and to the right. */
const TURN_LEFT = 'M4 12 a8 8 0 1 0 2.4 -5.7 M4 4 v4.5 h4.5';
const TURN_RIGHT = 'M20 12 a8 8 0 1 1 -2.4 -5.7 M20 4 v4.5 h-4.5';

/** A pad in the screen's middle, in the tiles' look; a tap anywhere outside closes it (no button). */
function PadCard({ size, title, note, onClose, children }: { size: number; title: string; note: string | null; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center]} entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View accessibilityViewIsModal style={[styles.padCard, { padding: size * 1.1, gap: size * 0.9 }]}>
        <Text style={[styles.padTitle, { fontSize: size * 0.92 }]}>{title}</Text>
        {children}
        {/* the room stays, so the pad does not jump when a note comes */}
        <Text style={[styles.padNote, { fontSize: size * 0.8, minHeight: size * 1.2 }]} accessibilityLiveRegion="polite" numberOfLines={1}>
          {note ?? ''}
        </Text>
      </View>
    </Animated.View>
  );
}

/** One key of a pad: white while its command runs, back to plain when it has ended (owner, 2026-11-23). */
function PadKey({
  cell,
  round,
  busy,
  label,
  onPress,
  children,
}: {
  cell: number;
  round?: boolean;
  busy: boolean;
  label: string;
  onPress: () => void;
  children: (fg: string) => ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={2}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      style={({ pressed }) => [
        styles.padKey,
        { width: cell, height: cell, borderRadius: round ? cell / 2 : 16 },
        round && styles.padCentre,
        busy && styles.optionOn,
        pressed && !busy && styles.padPressed,
      ]}
    >
      {children(busy ? ON_TEXT : mono.text)}
    </Pressable>
  );
}

const padCell = (h: number) => clamp(52, 0.11 * h, 84);

/**
 * LOOK (owner, 2026-11-23): four arrows round AHEAD, as on a remote. A tap turns the head a step that way at once
 * (no GO); the key stays white until the head has stopped. At an end the pad says so (Reached the top, ...).
 */
export function LookPad({ size, onLook, onClose }: { size: number; onLook: (dir: LookDir) => Promise<string | null>; onClose: () => void }) {
  const { t } = useI18n();
  const { height: h } = useWindowDimensions();
  const [busy, setBusy] = useState<LookDir | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cell = padCell(h);
  const gap = size * 0.5;
  const tap = (dir: LookDir) => {
    if (busy) return;
    setBusy(dir);
    setNote(null);
    onLook(dir)
      .then(setNote)
      .finally(() => setBusy(null));
  };
  const arrow = (dir: Exclude<LookDir, 'centre'>, label: TextKey) => (
    <PadKey cell={cell} busy={busy === dir} label={t(label)} onPress={() => tap(dir)}>
      {(fg) => (
        <Svg width={cell * 0.4} height={cell * 0.4} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${TURN_OF[dir]}deg` }] }}>
          <Path d={ARROW} stroke={fg} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </PadKey>
  );
  const blank = <View style={{ width: cell, height: cell }} />;
  return (
    <PadCard size={size} title={t('cmdLook')} note={note} onClose={onClose}>
      <View style={{ gap }}>
        <View style={[styles.padRow, { gap }]}>
          {blank}
          {arrow('up', 'cmdLookUp')}
          {blank}
        </View>
        <View style={[styles.padRow, { gap }]}>
          {arrow('left', 'cmdLookLeft')}
          <PadKey cell={cell} round busy={busy === 'centre'} label={t('cmdLookAhead')} onPress={() => tap('centre')}>
            {(fg) => <Text style={[styles.padWord, { fontSize: size * 0.72, color: fg }]}>{t('cmdLookAhead')}</Text>}
          </PadKey>
          {arrow('right', 'cmdLookRight')}
        </View>
        <View style={[styles.padRow, { gap }]}>
          {blank}
          {arrow('down', 'cmdLookDown')}
          {blank}
        </View>
      </View>
    </PadCard>
  );
}

/** TURN (owner, 2026-11-23): 45 deg left, half a turn, 45 deg right; each asks first, as every move of the base. */
export function TurnPad({ size, onTurn, onClose }: { size: number; onTurn: (way: TurnWay) => void; onClose: () => void }) {
  const { t } = useI18n();
  const { height: h } = useWindowDimensions();
  const cell = padCell(h);
  const gap = size * 0.5;
  const key = (way: TurnWay, label: TextKey, path: string | null) => (
    <View style={[styles.padCol, { gap: size * 0.4, width: cell * 1.25 }]}>
      <PadKey cell={cell} round={!path} busy={false} label={t(label)} onPress={() => onTurn(way)}>
        {(fg) =>
          path ? (
            <Svg width={cell * 0.44} height={cell * 0.44} viewBox="0 0 24 24">
              <Path d={path} stroke={fg} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ) : (
            <Text style={[styles.padWord, { fontSize: size * 0.9, color: fg }]}>180°</Text>
          )
        }
      </PadKey>
      <Text style={[styles.padLabel, { fontSize: size * 0.72 }]} numberOfLines={1}>
        {t(label)}
      </Text>
    </View>
  );
  return (
    <PadCard size={size} title={t('cmdTurn')} note={null} onClose={onClose}>
      <View style={[styles.padRow, { gap }]}>
        {key('left', 'cmdTurnLeft', TURN_LEFT)}
        {key('around', 'cmdTurnAround', null)}
        {key('right', 'cmdTurnRight', TURN_RIGHT)}
      </View>
    </PadCard>
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
        {!!text && <Button text={t('cmdClear')} size={size} onPress={() => setText('')} muted />}
        <Button
          text={t('cmdStart')}
          size={size}
          primary
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

/** Text on a chosen (white) option. */
const ON_TEXT = '#0a0a0a';

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  backdropDeep: { backgroundColor: 'rgba(0,0,0,0.72)' },
  center: { alignItems: 'center', justifyContent: 'center' },
  modal: { borderRadius: 22, borderWidth: 1, borderColor: '#3a3a3a', backgroundColor: 'rgba(12,12,14,0.98)' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  optionSmall: { justifyContent: 'center', borderRadius: 12 },
  optionOn: { borderColor: mono.text, backgroundColor: mono.text },
  optionWords: { flex: 1, gap: 2 },
  optionWordsSmall: { alignItems: 'center' },
  optionText: { fontFamily: fonts.mono, color: mono.text },
  optionTextSmall: { fontFamily: fonts.mono, color: mono.text, textAlign: 'center' },
  optionTextOn: { fontFamily: fonts.monoBold, color: ON_TEXT },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
  footerButton: { flexBasis: 0, flexGrow: 1, maxWidth: 220 },
  // the Commands tiles' look (commands.tsx tile): the same border, radius and glass
  padCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#2e2e2e', backgroundColor: 'rgba(12,12,14,0.98)' },
  padTitle: { alignSelf: 'flex-start', fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1, textTransform: 'uppercase' },
  padRow: { flexDirection: 'row', justifyContent: 'center' },
  padCol: { alignItems: 'center' },
  padKey: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  padCentre: { borderColor: '#555' },
  padWord: { fontFamily: fonts.monoBold, letterSpacing: 1, textTransform: 'uppercase' },
  padLabel: { fontFamily: fonts.mono, color: mono.soft, textAlign: 'center' },
  padNote: { fontFamily: fonts.mono, color: mono.yellow, textAlign: 'center' },
  padPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
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
  primary: { backgroundColor: mono.text, borderColor: mono.text },
  primaryOff: { borderColor: mono.soft, opacity: 0.85 },
  pressed: { opacity: 0.6 },
});
