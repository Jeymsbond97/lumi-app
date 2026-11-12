import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ConnectingView } from '../ui/ConnectingView';
import { findLumi } from '../lib/connection';
import { session } from '../lib/session';

const RETRY_MS = 1500;
const HOLD_CONNECTED_MS = 900; // eyes look at you for a moment before the home screen opens

export default function Connecting() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = async () => {
      try {
        const c = await findLumi();
        if (!alive) return;
        session.set(c);
        setConnected(true);
        timer = setTimeout(() => router.replace('/home'), HOLD_CONNECTED_MS);
      } catch {
        if (alive) timer = setTimeout(attempt, RETRY_MS);
      }
    };
    attempt();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <ConnectingView connected={connected} />;
}
