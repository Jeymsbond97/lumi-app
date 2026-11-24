// The Talk screen (owner, 2026-11-23: only what was heard and answered for now, and the errors): what visitors said to
// Lumi and what it answered (newest at the bottom, as spoken in English or Korean) from the assistant's log, whether the
// assistant listens, talks with someone, sings or is off, and its errors behind ERRORS. Greeter and Patrol (the modes
// on the left) switch the assistant on and off. The content sits between the modes on the left, the task card's room on
// the right, the power chips on top and the Dock, as on Commands.
// Owner, 2026-11-24: three views side by side (CONVERSATION, ALL WORDS, ERRORS), the one in view lit, so it is always
// clear where you are; CLEAN empties only the view in front (the others and the robot's log stay); each error says
// what to do about it.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSteadyWindow } from '../../lib/steadyWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { fill } from '../../lib/commands';
import { useI18n } from '../../lib/i18n';
import { useRobot } from '../../lib/robot';
import { errorFix, TALK_STATE_TEXT, talkState, type TalkState } from '../../lib/talk';
import { useTalk } from '../../lib/useTalk';
import { TalkLog } from '../../ui/TalkLog';
import { VolumeButton } from '../../ui/VolumeButton';
import { clamp, colors, fonts, mono } from '../../ui/theme';

const DOCK_SPACE = 64; // room the sections dock takes at the bottom, above the safe area

const STATE_DOT: Record<TalkState, string> = {
  off: mono.dim,
  listening: mono.green,
  talking: mono.blue,
  singing: mono.yellow,
};

export default function TalkScreen() {
  const { t } = useI18n();
  const { connection, modes } = useRobot();
  const url = connection.baseUrl;
  const { width: w, height: h } = useSteadyWindow();
  const inset = useSafeAreaInsets();
  const focused = useIsFocused();
  const talk = useTalk(url, focused);
  const [view, setView] = useState<'talk' | 'all' | 'errors'>('talk');
  const showErrors = view === 'errors';

  const state = talkState(modes, talk.recent, talk.newest, talk.singing !== null);
  const errors = talk.errors?.lines ?? [];
  const stuck = talk.errors?.stuck ?? false;
  const trouble = errors.length + (stuck ? 1 : 0);

  // ---------- layout ----------
  const size = clamp(13, 0.024 * h, 17);
  const modesText = clamp(13, 0.024 * h, 18); // ModesPanel's sizes: its switches stay clear
  const switchW = clamp(36, 0.06 * h, 46);
  const left = 26 + inset.left + 16 + 10 + modesText * 1.6 + modesText * 6.4 + switchW + 16;
  // the task card's room is kept free whether a task runs or not, so the screen does not jump when one starts or ends
  const right = 24 + inset.right + clamp(220, 0.42 * h, 340) + 12;
  const top = 14 + inset.top + Math.max(44, 0.075 * h);
  const bottom = 18 + inset.bottom + DOCK_SPACE;
  // in the screen's middle (owner, 2026-11-23): the same room on both sides, the larger of the modes' and the card's
  const side = Math.max(left, right);
  const inner = Math.max(200, Math.floor(w - 2 * side));
  const areaLeft = Math.floor((w - inner) / 2);

  const stateWords = talk.phase === 'lost' ? t('talkNoLog') : state === 'off' ? t('talkOffHint') : null;
  const empty = t(
    talk.phase === 'reading'
      ? 'talkReading'
      : talk.phase === 'lost'
        ? 'talkNoLog'
        : talk.cleaned[view]
          ? 'talkCleanedEmpty'
          : 'talkEmpty',
  );
  const lines = view === 'all' ? talk.allLines : talk.lines;
  const noErrors = t(!talk.errors ? 'talkReading' : talk.cleaned.errors ? 'talkCleanedNoErrors' : 'talkNoErrors');
  const canClean = showErrors ? errors.length > 0 : lines.length > 0;

  const toggle = (on: boolean, label: string, onPress: () => void, red = false, off = false) => (
    <Text
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: off }}
      suppressHighlighting
      style={[
        styles.toggle,
        { fontSize: size * 0.75, paddingHorizontal: size * 0.8, paddingVertical: size * 0.5 },
        on && styles.toggleOn,
        red && styles.toggleRed,
        on && red && styles.toggleRedOn,
        off && styles.toggleOff,
      ]}
    >
      {label}
    </Text>
  );

  // an error and, under it, what to do about it
  const fixed = (line: string, fix: string, bold = false) => (
    <View style={{ gap: size * 0.25 }}>
      <Text style={[styles.errorLine, bold && styles.errorStuck, { fontSize: size * 0.8 }]} selectable>
        {line}
      </Text>
      <View style={[styles.fixRow, { gap: size * 0.45 }]}>
        <Text style={[styles.fixTag, { fontSize: size * 0.6, paddingHorizontal: size * 0.35 }]}>{t('talkFix')}</Text>
        <Text style={[styles.fixWords, { fontSize: size * 0.78 }]} selectable>
          {fix}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.area, { left: areaLeft, top, bottom, width: inner, gap: size * 0.7 }]}>
        <View style={[styles.headRow, { gap: size * 0.5 }]}>
          <View
            style={[styles.status, styles.grow, { gap: size * 0.5, paddingHorizontal: size * 0.8, paddingVertical: size * 0.45 }]}
            accessibilityLiveRegion="polite"
          >
            <View style={[styles.statusDot, { width: size * 0.55, height: size * 0.55, backgroundColor: STATE_DOT[state] }]} />
            <Text style={[styles.statusHead, { fontSize: size * 0.8 }]}>{t('talkAssistant')}</Text>
            <Text style={[styles.statusState, { fontSize: size * 0.85 }]} numberOfLines={1}>
              {t(TALK_STATE_TEXT[state])}
            </Text>
            {stateWords && (
              <Text style={[styles.statusWords, { fontSize: size * 0.78 }]} numberOfLines={1}>
                {stateWords}
              </Text>
            )}
          </View>
          <View style={[styles.tabs, { gap: size * 0.3 }]}>
            {toggle(view === 'talk', t('talkViewTalk'), () => setView('talk'))}
            {toggle(view === 'all', t('talkAllWords'), () => setView('all'))}
            {toggle(
              showErrors,
              trouble > 0 ? fill(t('talkErrorsCount'), { n: trouble }) : t('talkErrors'),
              () => setView('errors'),
              trouble > 0,
            )}
          </View>
          {toggle(false, t('talkClean'), () => talk.clean(view), false, !canClean)}
        </View>
        {showErrors ? (
          <ScrollView style={styles.panel} contentContainerStyle={{ padding: size * 0.9, gap: size * 0.9 }}>
            {stuck && fixed(t('talkStuck'), t('fixStuck'), true)}
            {errors.length === 0 && !stuck && <Text style={[styles.statusWords, { fontSize: size * 0.85 }]}>{noErrors}</Text>}
            {[...errors].reverse().map((l, i) => (
              <View key={`${i}-${l}`}>{fixed(l, t(errorFix(l)))}</View>
            ))}
          </ScrollView>
        ) : (
          <TalkLog lines={lines} songs={talk.songs} size={size} empty={empty} />
        )}
      </View>
      <VolumeButton active={focused} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  area: { position: 'absolute' },
  grow: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  statusDot: { borderRadius: 99 },
  statusHead: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1.2, textTransform: 'uppercase' },
  statusState: { fontFamily: fonts.mono, color: mono.text, flexShrink: 1 },
  statusWords: { fontFamily: fonts.mono, color: mono.soft, flexShrink: 1 },
  toggle: {
    fontFamily: fonts.mono,
    color: mono.soft,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'rgba(8,8,8,0.92)',
    overflow: 'hidden',
  },
  toggleOn: { color: mono.text, borderColor: '#6a6a6a', backgroundColor: 'rgba(255,255,255,0.09)' },
  toggleRed: { color: mono.red, borderColor: 'rgba(255,45,45,0.55)' },
  toggleRedOn: { backgroundColor: 'rgba(255,45,45,0.14)', borderColor: 'rgba(255,45,45,0.8)' },
  toggleOff: { opacity: 0.35 },
  tabs: { flexDirection: 'row', alignItems: 'center' },
  fixRow: { flexDirection: 'row', alignItems: 'flex-start' },
  fixTag: {
    fontFamily: fonts.monoBold,
    color: mono.green,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: 'rgba(80,220,120,0.45)',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 1,
  },
  fixWords: { flex: 1, fontFamily: fonts.mono, color: mono.text },
  panel: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: '#2e2e2e', backgroundColor: 'rgba(255,255,255,0.02)' },
  errorLine: { fontFamily: fonts.mono, color: '#ff8a80' },
  errorStuck: { fontFamily: fonts.monoBold },
});
