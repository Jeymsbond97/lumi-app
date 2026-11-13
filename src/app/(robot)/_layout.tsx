// Every screen after the loading screen: Lumi is asked about once a second for all of them, and the status,
// the modes, the current task, the sections and STOP sit on top of each screen.
// While the landing view still covers the screen nothing shows over it (see lib/landing).
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RobotProvider } from '../../lib/robot';
import { LandingProvider, useLanding } from '../../lib/landing';
import { StatusHud } from '../../ui/StatusHud';
import { BatteryBadge } from '../../ui/BatteryBadge';
import { ModesPanel } from '../../ui/ModesPanel';
import { TaskCard } from '../../ui/TaskCard';
import { StopButton } from '../../ui/StopButton';
import { Dock } from '../../ui/Dock';
import { colors } from '../../ui/theme';

function Controls() {
  const { covering } = useLanding();
  if (covering) return null;
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(450)} pointerEvents="box-none">
      <StatusHud />
      <BatteryBadge />
      <ModesPanel />
      <TaskCard />
      <Dock />
      <StopButton />
    </Animated.View>
  );
}

export default function RobotLayout() {
  return (
    <RobotProvider>
      <LandingProvider>
        <View style={styles.root}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }} />
          <Controls />
        </View>
      </LandingProvider>
    </RobotProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
