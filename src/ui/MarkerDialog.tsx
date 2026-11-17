// Edits one marker of the map, as the base's own page does: a new name, moved to where Lumi stands, or deleted.
// The same card edits a no-go line (a new name or deleted).
// A charger's marker (the base docks with it) keeps being one when renamed or moved. Same look as NameDialog, under STOP.
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useI18n, type TextKey } from '../lib/i18n';
import { validMarkerName, type MapMarker } from '../lib/mapGeom';
import { clamp, fonts, mono } from './theme';

interface Props {
  /** A marker, or a no-go line (no dock, no move). */
  marker: (Pick<MapMarker, 'name'> & { dock?: boolean }) | null;
  title?: TextKey;
  /** Every marker's name on this map: a new name may not be one of them. */
  names: string[];
  onRename: (name: string) => void;
  /** Markers only: put it where Lumi stands. */
  onMoveHere?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function MarkerDialog(props: Props) {
  // mounted anew for each marker, so the name starts from it
  return props.marker ? <Edit key={props.marker.name} {...props} marker={props.marker} /> : null;
}

function Edit({
  marker,
  title = 'mapEditMarker',
  names,
  onRename,
  onMoveHere,
  onDelete,
  onClose,
}: Props & { marker: NonNullable<Props['marker']> }) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const size = clamp(13, 0.022 * height, 17);
  const [name, setName] = useState(marker.name);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const changed = name !== marker.name;
  const taken = changed && names.includes(name);
  const ok = changed && !taken && validMarkerName(name);
  const bad = changed && !ok;
  const font = { fontSize: size * 0.9 };
  const button = { height: size * 2.8, paddingHorizontal: size * 1.1 };

  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          entering={ZoomIn.duration(160)}
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              width: Math.min(460, width - 48),
              padding: size * 1.4,
              gap: size,
            },
          ]}
        >
          <Text style={[styles.title, { fontSize: size * 0.8 }]}>{t(title)}</Text>
          {marker.dock && <Text style={[styles.charger, { fontSize: size * 0.8 }]}>⌂ {t('mapChargerNote')}</Text>}
          <TextInput
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={50}
            onSubmitEditing={() => ok && onRename(name)}
            style={[styles.input, { fontSize: size * 1.1, paddingVertical: size * 0.6 }, bad && styles.inputBad]}
          />
          <Text style={[styles.rule, { fontSize: size * 0.8 }, bad && styles.ruleBad]}>{t(taken ? 'mapNameTaken' : 'mapNameRule')}</Text>
          <View style={[styles.buttons, { gap: size * 0.7 }]}>
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, button, styles.buttonDelete, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, font, { color: mono.red }]}>{t('delete')}</Text>
            </Pressable>
            {onMoveHere && (
              <Pressable
                onPress={onMoveHere}
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, button, pressed && styles.pressed]}
              >
                <Text style={[styles.buttonText, font, { color: mono.text }]}>{t('mapMoveHere')}</Text>
              </Pressable>
            )}
            <View style={styles.gap} />
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, button, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, font, { color: mono.soft }]}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => ok && onRename(name)}
              disabled={!ok}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ok }}
              style={({ pressed }) => [styles.button, button, styles.buttonOn, !ok && styles.buttonOff, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, font, { color: mono.green }]}>{t('mapSave')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mono.dim,
    backgroundColor: 'rgba(8,8,8,0.96)',
  },
  title: {
    fontFamily: fonts.mono,
    color: mono.soft,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  charger: { fontFamily: fonts.mono, color: mono.blue },
  input: {
    fontFamily: fonts.monoBold,
    color: mono.text,
    borderBottomWidth: 1.5,
    borderBottomColor: mono.text,
  },
  inputBad: { borderBottomColor: mono.red },
  rule: { fontFamily: fonts.mono, color: mono.soft },
  ruleBad: { color: mono.red },
  buttons: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  gap: { flex: 1 },
  button: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: mono.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDelete: {
    borderColor: mono.red,
    backgroundColor: 'rgba(255,45,45,0.12)',
  },
  buttonOn: { borderColor: mono.green },
  buttonOff: { opacity: 0.4 },
  buttonText: {
    fontFamily: fonts.monoBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pressed: { opacity: 0.6 },
});
