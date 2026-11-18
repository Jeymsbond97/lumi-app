// Every screen after the loading screen: Lumi is asked about once a second for all of them, and the status,
// the modes, the current task, the cameras, the sections and STOP sit on top of each screen.
// While the landing view still covers the screen nothing shows over it (see lib/landing).
import { StyleSheet, View } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RobotProvider } from '../../lib/robot';
import { LandingProvider, useLanding } from '../../lib/landing';
import { noteTouch } from '../../lib/driveLock';
import { useCameraOpen } from '../../lib/cameraOpen';
import { StatusHud } from '../../ui/StatusHud';
import { BatteryBadge } from '../../ui/BatteryBadge';
import { ModesPanel } from '../../ui/ModesPanel';
import { TaskCard } from '../../ui/TaskCard';
import { StopButton } from '../../ui/StopButton';
import { EstopButton } from '../../ui/EstopButton';
import { Dock } from '../../ui/Dock';
import { CameraPanel } from '../../ui/CameraPanel';
import { colors } from '../../ui/theme';

function Controls() {
  const { covering } = useLanding();
  const path = usePathname();
  const camera = useCameraOpen(); // the camera panel covers where the task card sits
  if (covering) return null;
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(450)} pointerEvents="box-none">
      <BatteryBadge />
      {/* the map needs the room (its navbar has its own controls); Drive has no use for them (owner, 2026-11-18) */}
      {path !== '/map' && path !== '/drive' && <ModesPanel />}
      {!camera && <TaskCard />}
      {/* the cameras open from the right edge on every section (owner, 2026-11-18); Drive shows them big itself */}
      {path !== '/drive' && <CameraPanel />}
      <Dock />
      {/* the status bar's confirm dialog covers everything here but STOP */}
      <StatusHud />
      <StopButton />
      <EstopButton />
    </Animated.View>
  );
}

export default function RobotLayout() {
  return (
    <RobotProvider>
      <LandingProvider>
        {/* every touch on these screens counts as someone being there: the joystick locks after 5 minutes without */}
        <View
          style={styles.root}
          onStartShouldSetResponderCapture={() => {
            noteTouch(Date.now());
            return false;
          }}
        >
          {/* Tabs, not a stack: a section stays alive while another is open, so Home's 3D scene is not loaded again
              (going back to Home from Map showed the loading visor under the controls). Our own Dock is the tab bar. */}
          <Tabs
            tabBar={() => null}
            screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'fade' }}
          >
            {/* every section has to be declared, else this router draws nothing */}
            <Tabs.Screen name="home" />
            <Tabs.Screen name="commands" />
            <Tabs.Screen name="map" />
            <Tabs.Screen name="drive" />
          </Tabs>
          <Controls />
        </View>
      </LandingProvider>
    </RobotProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
