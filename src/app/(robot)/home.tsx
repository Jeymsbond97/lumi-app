import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useIsFocused } from 'expo-router';
import { toSceneState } from '../../scene/sceneState';
import { Joystick } from '../../ui/Joystick';
import { LumiScene } from '../../ui/LumiScene';
import { useRobot } from '../../lib/robot';
import { useLiveJoints } from '../../lib/useLiveJoints';
import { ConnectingView } from '../../ui/ConnectingView';
import { useLanding } from '../../lib/landing';

export default function Home() {
  const [sceneReady, setSceneReady] = useState(false);
  const { status, joints, connection } = useRobot();
  // the arm's joints 5 times a second while Home shows it and the arm has power (the round asks once a second)
  const focused = useIsFocused();
  const armOn = !!status && status.armState !== 'off' && !status.armSilent;
  const liveJoints = useLiveJoints(connection.baseUrl, focused && armOn);
  const { done: landingDone } = useLanding();

  // the controls on top of the screen appear once the robot is drawn
  useEffect(() => {
    if (sceneReady) landingDone();
  }, [sceneReady, landingDone]);

  // the robot's pose follows every reply the layout gets; the HUD reads the same status
  const scene = useMemo(() => (status ? toSceneState(status, liveJoints ?? joints) : null), [status, joints, liveJoints]);

  return (
    <View style={styles.root}>
      <View style={styles.web}>
        <LumiScene state={scene} onReady={() => setSceneReady(true)} />
      </View>
      <Joystick />
      {/* Lumi keeps looking at you until the 3D robot is drawn, then the scene shows through */}
      {!sceneReady && (
        <Animated.View style={StyleSheet.absoluteFill} exiting={FadeOut.duration(450)} pointerEvents="none">
          <ConnectingView connected />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040a' },
  web: { flex: 1 },
});
