// Talk's conversation: what Lumi heard and what it said, newest at the bottom, each in the language it was spoken.
// It follows the newest line unless someone has scrolled up to read; scrolling back down follows again.
import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { fill } from '../lib/commands';
import { useI18n, type TextKey } from '../lib/i18n';
import type { Song } from '../lib/commands';
import type { TalkLine } from '../lib/talk';
import { fonts, mono } from './theme';

/** Closer than this to the bottom counts as at the bottom. */
const FOLLOW_PX = 40;

function speaker(l: TalkLine): TextKey {
  if (l.who === 'lumi') return 'talkLumi';
  return l.local ? 'talkYou' : 'talkPerson';
}

export function TalkLog({
  lines,
  songs,
  size,
  empty,
}: {
  lines: TalkLine[];
  songs: Song[];
  size: number;
  /** Said when there are no lines. */
  empty: string;
}) {
  const { t, lang } = useI18n();
  const ref = useRef<ScrollViewInstance>(null);
  const follow = useRef(true);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    follow.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - FOLLOW_PX;
  };
  const songTitle = (id: string) => {
    const s = songs.find((x) => x.id === id);
    return s ? (lang === 'ko' ? s.titleKo : s.title) : id;
  };

  return (
    <View style={styles.card}>
      {lines.length === 0 ? (
        <Text style={[styles.empty, { fontSize: size * 0.85, padding: size }]}>{empty}</Text>
      ) : (
        <ScrollView
          ref={ref}
          onScroll={onScroll}
          scrollEventThrottle={100}
          onContentSizeChange={() => follow.current && ref.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={{ padding: size * 0.8, gap: size * 0.55 }}
          showsVerticalScrollIndicator={false}
        >
          {lines.map((l) => {
            if (l.kind === 'end')
              return (
                <View key={l.key} style={[styles.endRow, { gap: size * 0.6 }]}>
                  <View style={styles.rule} />
                  <Text style={[styles.endText, { fontSize: size * 0.7 }]}>
                    {fill(t('talkEnded'), { time: l.time })}
                  </Text>
                  <View style={styles.rule} />
                </View>
              );
            const quiet = l.kind === 'wake' || l.kind === 'overheard';
            const tag: TextKey | null = l.kind === 'wake' ? 'talkWake' : l.kind === 'overheard' ? 'talkOverheard' : l.typed ? 'talkTyped' : null;
            const words = l.kind === 'song' ? fill(t('talkSong'), { song: songTitle(l.text) }) : l.text;
            return (
              <View key={l.key} style={[styles.row, { gap: size * 0.6 }]}>
                <Text style={[styles.time, { fontSize: size * 0.72, width: size * 3.1 }]}>{l.time}</Text>
                <View style={styles.body}>
                  <View style={[styles.head, { gap: size * 0.45 }]}>
                    <Text style={[styles.who, { fontSize: size * 0.72 }, l.who === 'lumi' && styles.whoLumi, quiet && styles.dim]}>
                      {t(speaker(l))}
                    </Text>
                    {l.lang && (
                      <Text style={[styles.tag, { fontSize: size * 0.62, paddingHorizontal: size * 0.35 }]}>
                        {t(l.lang === 'ko' ? 'talkLangKo' : 'talkLangEn')}
                      </Text>
                    )}
                    {tag && <Text style={[styles.note, { fontSize: size * 0.68 }]}>{t(tag)}</Text>}
                  </View>
                  <Text style={[styles.words, { fontSize: size * 0.92 }, l.who === 'lumi' && styles.wordsLumi, quiet && styles.dim]}>
                    {words}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: 'rgba(14,15,17,0.92)',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.mono, color: mono.soft },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  time: { fontFamily: fonts.mono, color: mono.dim, paddingTop: 1 },
  body: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  who: { fontFamily: fonts.monoBold, color: mono.soft, letterSpacing: 1.2, textTransform: 'uppercase' },
  whoLumi: { color: mono.blue },
  tag: {
    fontFamily: fonts.mono,
    color: mono.soft,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderRadius: 6,
    overflow: 'hidden',
  },
  note: { fontFamily: fonts.mono, color: mono.dim },
  words: { fontFamily: fonts.mono, color: mono.soft },
  wordsLumi: { color: mono.text },
  dim: { color: mono.dim },
  endRow: { flexDirection: 'row', alignItems: 'center' },
  rule: { flex: 1, height: 1, backgroundColor: '#262626' },
  endText: { fontFamily: fonts.mono, color: mono.dim, letterSpacing: 1.2, textTransform: 'uppercase' },
});
