// Small globe in the top right corner; tapping it lets people pick English or Korean.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { LANGS, useI18n } from '../lib/i18n';
import { fonts } from './theme';

function Globe({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Circle cx={12} cy={12} r={9} />
      <Ellipse cx={12} cy={12} rx={4} ry={9} />
      <Path d="M3.5 9h17M3.5 15h17" strokeLinecap="round" />
    </Svg>
  );
}

export function LanguageButton() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const inset = useSafeAreaInsets();
  const top = 14 + inset.top;
  const right = 18 + inset.right;

  return (
    <>
      {open && <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={t('language')} />}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('language')}
        style={({ pressed }) => [styles.button, { top, right }, pressed && styles.pressed]}
      >
        <Globe size={18} color="#c9d6dd" />
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={[styles.menu, { top: top + 44, right }]}>
          <Text style={styles.menuTitle}>{t('language')}</Text>
          {LANGS.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => {
                setLang(l.id);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: lang === l.id }}
            >
              <Text style={[styles.itemText, lang === l.id && styles.itemActive]}>{l.label}</Text>
              <View style={[styles.check, lang === l.id && styles.checkOn]} />
            </Pressable>
          ))}
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,20,26,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(160,190,205,0.18)',
  },
  pressed: { opacity: 0.6 },
  menu: {
    position: 'absolute',
    minWidth: 160,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(12,17,22,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(160,190,205,0.16)',
  },
  menuTitle: { fontFamily: fonts.medium, fontSize: 12, color: '#6f818c', paddingHorizontal: 14, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  itemText: { fontFamily: fonts.body, fontSize: 15, color: '#c9d6dd' },
  itemActive: { fontFamily: fonts.semibold, color: '#eef2f5' },
  check: { width: 8, height: 8, borderRadius: 4, marginLeft: 16 },
  checkOn: { backgroundColor: '#7fe0a6' },
});
