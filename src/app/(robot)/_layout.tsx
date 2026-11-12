// Every screen after the loading screen: Lumi is asked about once a second for all of them, and the status,
// the modes, the current task and STOP sit on top of each screen.
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { RobotProvider } from '../../lib/robot';
import { StatusHud } from '../../ui/StatusHud';
import { BatteryBadge } from '../../ui/BatteryBadge';
import { ModesPanel } from '../../ui/ModesPanel';
import { TaskCard } from '../../ui/TaskCard';
import { StopButton } from '../../ui/StopButton';
import { colors } from '../../ui/theme';

export default function RobotLayout() {
  return (
    <RobotProvider>
      <View style={styles.root}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }} />
        <StatusHud />
        <BatteryBadge />
        <ModesPanel />
        <TaskCard />
        <StopButton />
      </View>
    </RobotProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
