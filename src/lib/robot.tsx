// What every screen after the loading screen knows about Lumi, asked once for all of them.
// One round of requests at a time, about once a second; three failed rounds in a row mean the robot is lost.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { getArmJoints, getModes, getStatus, getTaskState, isEnded, type Modes, type RobotStatus, type TaskState } from './api';
import type { Connection } from './connection';
import { session } from './session';

const POLL_MS = 1000;
const LOST_AFTER_FAILS = 3;
/** How long a finished task stays on screen, so people see how it ended. */
const ENDED_SHOWN_MS = 8000;

export interface Robot {
  connection: Connection;
  status: RobotStatus | null;
  /** Arm joints in degrees while the arm has power. */
  joints: number[] | null;
  /** The task card's content; null when there is nothing to show. */
  task: TaskState | null;
  /** null until the robot has said which modes are on. */
  modes: Modes | null;
  /** Set a reply from a command right away instead of waiting for the next round. */
  setModes: (m: Modes) => void;
}

const RobotContext = createContext<Robot | null>(null);

export interface TaskMemory {
  prev: TaskState | null;
  endedUntil: number;
}

/**
 * Shows a task that has ended only when this app saw it going, and only for a moment:
 * the robot keeps the last result ("done") until the next task, which is old news later on.
 */
export function taskToShow(mem: TaskMemory, next: TaskState | null, now: number): TaskState | null {
  const before = mem.prev;
  mem.prev = next;
  if (!next || !isEnded(next.phase)) return next;
  if (before && !isEnded(before.phase)) mem.endedUntil = now + ENDED_SHOWN_MS;
  return now < mem.endedUntil ? next : null;
}

export function RobotProvider({ children }: { children: ReactNode }) {
  const connection = session.connection;
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [joints, setJoints] = useState<number[] | null>(null);
  const [task, setTask] = useState<TaskState | null>(null);
  const [modes, setModes] = useState<Modes | null>(null);
  const taskMemory = useRef<TaskMemory>({ prev: null, endedUntil: 0 });

  useEffect(() => {
    if (!connection) {
      router.replace('/');
      return;
    }
    const url = connection.baseUrl;
    let fails = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const started = Date.now();
      try {
        // the task and the modes are extras: a slow reply there must not count as losing the robot
        const [st, t, m] = await Promise.all([
          getStatus(url),
          getTaskState(url).catch(() => undefined),
          getModes(url).catch(() => undefined),
        ]);
        const j = st.armState === 'off' ? null : await getArmJoints(url).catch(() => null);
        fails = 0;
        if (!alive) return;
        setStatus(st);
        setJoints(j);
        if (t !== undefined) setTask(taskToShow(taskMemory.current, t, Date.now()));
        if (m !== undefined) setModes(m);
      } catch {
        fails += 1;
        if (alive && fails >= LOST_AFTER_FAILS) {
          session.set(null);
          router.replace('/');
          return;
        }
      }
      if (alive) timer = setTimeout(tick, Math.max(0, POLL_MS - (Date.now() - started)));
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [connection]);

  if (!connection) return null;
  return (
    <RobotContext.Provider value={{ connection, status, joints, task, modes, setModes }}>{children}</RobotContext.Provider>
  );
}

export function useRobot(): Robot {
  const ctx = useContext(RobotContext);
  if (!ctx) throw new Error('useRobot must be used inside RobotProvider');
  return ctx;
}
