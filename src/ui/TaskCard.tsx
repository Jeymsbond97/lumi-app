// The current task, right middle (the modes panel sits on the left): how it goes, the step it is on, and Pause / Resume, Release and Stop.
// Shown while a task runs and for a moment after it ends; the robot's next reply moves it on.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { isEnded, stepText, taskButtons, taskCommand, type TaskCommand, type TaskPhase } from '../lib/api';
import { useI18n, type TextKey } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts, mono } from './theme';

const PHASE_TEXT: Record<TaskPhase, TextKey> = {
  running: 'taskRunning',
  waiting: 'taskWaiting',
  holding: 'taskHolding',
  done: 'taskDone',
  stopped: 'taskStopped',
  failed: 'taskFailed',
};

const PHASE_COLOUR: Record<TaskPhase, string> = {
  running: '#7fe0a6',
  waiting: '#7fd6ff',
  holding: '#7fd6ff',
  done: '#7fe0a6',
  stopped: '#ffcf33',
  failed: '#ff8a80',
};

const BUTTON_TEXT: Record<TaskCommand, TextKey> = { pause: 'pause', resume: 'resume', stop: 'stopTask', release: 'release' };

export function TaskCard() {
  const { t } = useI18n();
  const { connection, task } = useRobot();
  const { height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const text = clamp(12, 0.021 * h, 17);

  if (!task) return null;

  const send = (c: TaskCommand) => {
    Haptics.impactAsync(c === 'stop' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFailed(false);
    taskCommand(connection.baseUrl, c).catch(() => setFailed(true));
  };

  const key = stepText(task.step);
  const step = key ? t(key) : task.step;
  const phase: TextKey = task.paused && !isEnded(task.phase) ? 'taskPaused' : PHASE_TEXT[task.phase];
  const colour = task.paused ? '#ffcf33' : PHASE_COLOUR[task.phase];

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(300)}
      style={[styles.card, { right: 24 + inset.right, top: '34%', maxWidth: clamp(220, 0.42 * h, 340) }]}
    >
      <View style={[styles.row, { gap: text * 0.5 }]}>
        <View style={[styles.dot, { width: text * 0.55, height: text * 0.55, backgroundColor: colour }]} />
        <Text style={[styles.phase, { fontSize: text * 1.1 }]}>{t(phase)}</Text>
      </View>
      {step !== '' && <Text style={[styles.step, { fontSize: text, marginTop: text * 0.3 }]}>{step}</Text>}
      {taskButtons(task).length > 0 && (
        <View style={[styles.row, { gap: text * 0.6, marginTop: text * 0.8 }]}>
          {taskButtons(task).map((c) => (
            <Pressable
              key={c}
              onPress={() => send(c)}
              hitSlop={6}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { paddingHorizontal: text * 0.9, paddingVertical: text * 0.45 },
                c === 'stop' && styles.buttonStop,
                c === 'release' && styles.buttonRelease,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.buttonText, { fontSize: text * 0.9 }]}>{t(BUTTON_TEXT[c])}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {failed && <Text style={[styles.error, { fontSize: text * 0.85, marginTop: text * 0.4 }]}>{t('noAnswer')}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(232,232,232,0.16)',
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dot: { borderRadius: 99 },
  phase: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1, textTransform: 'uppercase' },
  step: { fontFamily: fonts.mono, color: mono.soft },
  button: { borderRadius: 999, borderWidth: 1.5, borderColor: mono.text },
  buttonStop: { backgroundColor: mono.red, borderColor: mono.red },
  buttonRelease: { borderColor: mono.blue },
  pressed: { opacity: 0.6 },
  buttonText: { fontFamily: fonts.mono, color: mono.text, letterSpacing: 1, textTransform: 'uppercase' },
  error: { fontFamily: fonts.mono, color: mono.red },
});
