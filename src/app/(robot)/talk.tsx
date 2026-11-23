// The Talk screen: the conversation itself. What Lumi heard and what it said (newest at the bottom, as spoken in
// English or Korean) from the assistant's log, whether the assistant listens, talks with someone, sings or is off,
// a box to type words for Lumi to say or a question it answers, and quick words said with one tap.
// Greeter and Patrol (the modes on the left) switch the assistant on and off. The content sits between the modes on
// the left, the readings or the task card on the right, the power chips on top and the Dock, as on Commands.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { askRequest, assistantTalks, reasonKey, sayRequest, send, toAnswer, toOutcome, type Outcome } from '../../lib/commands';
import { useI18n, type Lang, type TextKey } from '../../lib/i18n';
import { useRobot } from '../../lib/robot';
import { localLine, TALK_STATE_TEXT, talkState, type TalkState } from '../../lib/talk';
import { useTalk } from '../../lib/useTalk';
import { TalkComposer, TalkPhrases } from '../../ui/TalkComposer';
import { TalkLog } from '../../ui/TalkLog';
import { VolumeButton } from '../../ui/VolumeButton';
import { clamp, colors, fonts, mono } from '../../ui/theme';

const DOCK_SPACE = 64; // room the sections dock takes at the bottom, above the safe area
const DONE_SHOWN_MS = 4000; // a finished send's line stays this long
/** From this content width the box and the quick words stand in a column beside the conversation (the tablet). */
const TWO_COLUMNS_FROM = 720;

const STATE_DOT: Record<TalkState, string> = {
  off: mono.dim,
  listening: mono.green,
  talking: mono.blue,
  singing: mono.yellow,
};

interface Last extends Outcome {
  label: TextKey;
  at: number;
}

export default function TalkScreen() {
  const { t, lang } = useI18n();
  const { connection, task, modes } = useRobot();
  const url = connection.baseUrl;
  const { width: w, height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const focused = useIsFocused();
  const talk = useTalk(url, focused);
  const { add, refresh } = talk;

  // the voice follows the app's language until someone picks one
  const [picked, setVoice] = useState<Lang | null>(null);
  const voice = picked ?? lang;
  const [all, setAll] = useState(false);
  const [last, setLast] = useState<Last | null>(null);

  useEffect(() => {
    if (!last || last.phase === 'sending' || last.phase === 'refused' || last.phase === 'lost') return;
    const at = last.at;
    const id = setTimeout(() => setLast((p) => (p && p.at === at ? null : p)), DONE_SHOWN_MS);
    return () => clearTimeout(id);
  }, [last]);

  const assistant = assistantTalks(modes);
  const state = talkState(modes, talk.lines, talk.newest, talk.singing !== null);

  // ---------- sending ----------
  const speak = useCallback(
    (label: TextKey, words: string, ask: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const at = Date.now();
      // the assistant owns the speaker while it runs: it says the words as a mission step or answers the question as
      // if it heard it (in its log); otherwise /say and /ask speak, and the app keeps the lines itself
      const req = ask ? askRequest(words, modes) : sayRequest(words, modes, voice);
      const waits = !assistant;
      if (ask && !assistant) add(localLine('person', words, new Date(), true));
      setLast({ label, at, phase: 'sending', reason: null, answer: null });
      send(url, req).then((reply) => {
        const out = toOutcome(reply, waits);
        setLast((p) => (p && p.at !== at ? p : { label, at, ...out }));
        // said words are never in lumi.log (/say, or a mission's say step, run in the API), so the app keeps them
        if (reply.ok && !ask) add(localLine('lumi', words, new Date(), true));
        const answer = ask && reply.ok ? toAnswer(reply.data) : null;
        if (answer) add(localLine('lumi', answer, new Date(), false));
        refresh();
      });
    },
    [url, modes, voice, assistant, add, refresh],
  );
  const say = (words: string) => speak('cmdSay', words, false);
  const ask = (words: string) => speak('cmdAsk', words, true);

  // ---------- layout ----------
  const size = clamp(13, 0.024 * h, 17);
  const modesText = clamp(13, 0.024 * h, 18); // ModesPanel's sizes: its switches stay clear
  const switchW = clamp(36, 0.06 * h, 46);
  const left = 26 + inset.left + 16 + 10 + modesText * 1.6 + modesText * 6.4 + switchW + 16;
  const right = 24 + inset.right + (task ? clamp(220, 0.42 * h, 340) + 12 : clamp(11, 0.019 * h, 15) * 7 + 12);
  const top = 14 + inset.top + Math.max(44, 0.075 * h);
  const bottom = 18 + inset.bottom + DOCK_SPACE;
  const inner = Math.max(200, Math.floor(w - left - right));
  const gap = size * 0.7;
  const wide = inner >= TWO_COLUMNS_FROM;
  // whole pixels with one to spare: a fraction rounds up on the tablet and wraps
  const sideW = Math.floor(clamp(280, inner * 0.36, 420)) - 1;
  const logW = Math.floor(inner - sideW - gap) - 1;

  const stateWords = talk.phase === 'lost' ? t('talkNoLog') : state === 'off' ? t('talkOffHint') : null;
  const empty = t(talk.phase === 'reading' ? 'talkReading' : talk.phase === 'lost' ? 'talkNoLog' : 'talkEmpty');
  const lines = all ? talk.lines : talk.lines.filter((l) => l.kind !== 'overheard');

  const sendLine = (): { dot: string; words: string } | null => {
    if (!last) return null;
    switch (last.phase) {
      case 'sending':
        return { dot: mono.soft, words: t('cmdSending') };
      case 'sent':
        return { dot: mono.green, words: t('cmdSent') };
      case 'assistant':
        return { dot: mono.green, words: t('cmdSentAssistant') };
      case 'done':
        return { dot: mono.green, words: t('cmdDone') };
      case 'refused': {
        const k = reasonKey(last.reason);
        return { dot: mono.yellow, words: k ? t(k) : last.reason ?? t('cmdRefused') };
      }
      case 'lost':
        return { dot: mono.red, words: t('noAnswer') };
    }
  };
  const sent = sendLine();

  const header = (
    <View style={[styles.headRow, { gap: size * 0.5 }]}>
      <View style={[styles.status, styles.grow, { gap: size * 0.5, paddingHorizontal: size * 0.8, paddingVertical: size * 0.45 }]} accessibilityLiveRegion="polite">
        <View style={[styles.statusDot, { width: size * 0.55, height: size * 0.55, backgroundColor: STATE_DOT[state] }]} />
        <Text style={[styles.statusHead, { fontSize: size * 0.8 }]}>{t('talkAssistant')}</Text>
        <Text style={[styles.statusState, { fontSize: size * 0.85 }]}>{t(TALK_STATE_TEXT[state])}</Text>
        {stateWords && (
          <Text style={[styles.statusWords, { fontSize: size * 0.78 }]} numberOfLines={1}>
            {stateWords}
          </Text>
        )}
      </View>
      <Text
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setAll((a) => !a);
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: all }}
        suppressHighlighting
        style={[styles.toggle, { fontSize: size * 0.75, paddingHorizontal: size * 0.8, paddingVertical: size * 0.5 }, all && styles.toggleOn]}
      >
        {t('talkAllWords')}
      </Text>
    </View>
  );
  const sentRow = sent && (
    <View style={[styles.sentRow, { gap: size * 0.45 }]}>
      <View style={[styles.statusDot, { width: size * 0.5, height: size * 0.5, backgroundColor: sent.dot }]} />
      <Text style={[styles.statusHead, { fontSize: size * 0.72 }]}>{last && t(last.label)}</Text>
      <Text style={[styles.statusWords, { fontSize: size * 0.78 }]} numberOfLines={2}>
        {sent.words}
      </Text>
    </View>
  );
  const log = <TalkLog lines={lines} songs={talk.songs} size={size} empty={empty} />;

  return (
    <View style={styles.root}>
      {wide ? (
        <View style={[styles.area, styles.columns, { left, top, bottom, width: inner, gap }]}>
          <View style={{ width: logW, gap }}>
            {header}
            {log}
          </View>
          <View style={{ width: sideW, gap }}>
            <TalkComposer size={size} stacked onSay={say} onAsk={ask} />
            {sentRow}
            <TalkPhrases size={size} wrap voice={voice} onVoice={setVoice} onSay={say} />
          </View>
        </View>
      ) : (
        <View style={[styles.area, { left, top, bottom, width: inner, gap: size * 0.55 }]}>
          {header}
          <TalkComposer size={size} stacked={false} onSay={say} onAsk={ask} />
          {sentRow}
          <TalkPhrases size={size} wrap={false} voice={voice} onVoice={setVoice} onSay={say} />
          {log}
        </View>
      )}
      <VolumeButton active={focused} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  area: { position: 'absolute' },
  columns: { flexDirection: 'row' },
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
  statusState: { fontFamily: fonts.mono, color: mono.text },
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
  sentRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
});
