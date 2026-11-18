// The Map screen's SETTINGS list: four of the base page's configuration settings (speed, turn speed, and how close
// to a marker and how straight on it Lumi counts as arrived: stop margin, angle margin). - and + change them here; SAVE asks first and
// then saves on the base the way its page does (docs/MAP.md "Settings"). DEFAULTS puts the base page's defaults back
// here, still to be saved.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getBaseSettings, NeedsUpdateError, saveBaseSetting } from '../lib/api';
import { SETTING_TEXT, settingText, stepSetting, type BaseSetting, type SettingName } from '../lib/baseInfo';
import { useI18n, type TextKey } from '../lib/i18n';
import type { ConfirmRequest } from './ConfirmDialog';
import { fonts, mono } from './theme';

type Draft = Partial<Record<SettingName, number>>;

export function BaseSettingsList({
  baseUrl,
  ask,
  note,
}: {
  baseUrl: string;
  ask: (r: ConfirmRequest) => void;
  note: (key: TextKey, bad?: boolean) => void;
}) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<BaseSetting[] | null>(null);
  const [failed, setFailed] = useState<TextKey | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    getBaseSettings(baseUrl).then(
      (s) => {
        setFailed(null);
        setSettings(s);
        setDraft({});
      },
      (e) => setFailed(e instanceof NeedsUpdateError ? 'needsUpdate' : 'settingsNoAnswer'),
    );
  }, [baseUrl]);
  useEffect(load, [load]);

  if (failed) return <Text style={styles.quiet}>{t(failed)}</Text>;
  if (!settings)
    return (
      <View style={styles.reading}>
        <ActivityIndicator size="small" color={mono.soft} />
        <Text style={styles.quiet}>{t('settingsReading')}</Text>
      </View>
    );

  const now = (s: BaseSetting) => draft[s.name] ?? s.value ?? s.def;
  const changed = settings.filter((s) => draft[s.name] !== undefined && draft[s.name] !== s.value);

  const step = (s: BaseSetting, dir: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {});
    setDraft((d) => ({ ...d, [s.name]: stepSetting(s, now(s), dir) }));
  };
  const defaults = () => {
    Haptics.selectionAsync().catch(() => {});
    setDraft(Object.fromEntries(settings.map((s) => [s.name, s.def])));
  };
  const save = () =>
    ask({
      title: `${t('settingsSaveAsk')}\n${changed.map((s) => `${t(SETTING_TEXT[s.name])} ${settingText(s.name, now(s))}`).join('\n')}`,
      choices: [
        {
          text: t('settingsSave'),
          onPress: async () => {
            setSaving(true);
            try {
              for (const s of changed) await saveBaseSetting(baseUrl, s.name, now(s));
              note('settingsSaved');
            } catch (e) {
              note(e instanceof NeedsUpdateError ? 'needsUpdate' : 'settingsNoAnswer', true);
            }
            setSaving(false);
            load();
          },
        },
      ],
    });

  return (
    <>
      {settings.map((s) => {
        const v = now(s);
        const edited = draft[s.name] !== undefined && draft[s.name] !== s.value;
        return (
          <View key={s.name} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {t(SETTING_TEXT[s.name])}
            </Text>
            <View style={styles.stepper}>
              <Step text="-" disabled={saving || v <= s.min} onPress={() => step(s, -1)} />
              <Text style={[styles.value, edited && styles.valueEdited]} numberOfLines={1} adjustsFontSizeToFit>{settingText(s.name, v)}</Text>
              <Step text="+" disabled={saving || v >= s.max} onPress={() => step(s, 1)} />
            </View>
          </View>
        );
      })}
      <View style={styles.sep} />
      <View style={styles.buttons}>
        <Pressable
          onPress={defaults}
          disabled={saving}
          style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}
        >
          <Text style={styles.btnText}>{t('settingsDefaults')}</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={saving || changed.length === 0}
          style={({ pressed }) => [
            styles.btn,
            styles.btnSave,
            (saving || changed.length === 0) && styles.btnOff,
            pressed && styles.pressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={mono.green} />
          ) : (
            <Text style={[styles.btnText, styles.btnSaveText]}>{t('settingsSave')}</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

function Step({ text, disabled, onPress }: { text: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.step, disabled && styles.btnOff, pressed && styles.pressed]}
    >
      <Text style={styles.stepText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  // the names are short (i18n) so they fit beside the value on a 260 px list
  label: { flexShrink: 1, fontFamily: fonts.mono, fontSize: 12, color: '#cfcfcf' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontFamily: fonts.monoBold, fontSize: 14, color: mono.text, lineHeight: 16 },
  // one fixed width for every value (the longest, "0.70 rad/s", fits): the - and + of all rows line up
  value: { width: 76, textAlign: 'center', fontFamily: fonts.monoBold, fontSize: 12, color: mono.text },
  valueEdited: { color: mono.green },
  sep: { height: 1, backgroundColor: '#333', marginVertical: 4 },
  buttons: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingVertical: 4 },
  btn: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnQuiet: { borderColor: '#555' },
  btnSave: { borderColor: mono.green, backgroundColor: 'rgba(61,255,139,0.12)' },
  btnOff: { opacity: 0.35 },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.2, color: mono.text, textTransform: 'uppercase' },
  btnSaveText: { color: mono.green },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  quiet: { fontFamily: fonts.mono, fontSize: 12, color: mono.dim, paddingHorizontal: 10, paddingVertical: 5 },
  pressed: { opacity: 0.6 },
});
