import { useEffect, useState } from 'react';
import { throttle } from 'lodash-es';
import CursorList from './CursorList';
import CursorPointers from './CursorPointers';
import { actorCore } from "../index";
import { type CursorState } from '../cursor-room';

interface CursorEvent {
  id: string;
  cursor: CursorState;
}

// Modern color palette
const CURSOR_COLORS = [
  '#FF0080', // Pink
  '#7928CA', // Purple
  '#0070F3', // Blue
  '#00DFD8', // Cyan
  '#F5A623', // Orange
  '#79FFE1', // Mint
  '#F81CE5', // Magenta
  '#FF4D4D', // Red
] as const;

// Constants
const THROTTLE_MS = 16;
const BACKGROUND_COLOR = '#06080C';

function App() {
  const [actorState] = actorCore.useActor("cursorRoom");
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const [userName] = useState(() => `User ${Math.floor(Math.random() * 10000)}`);

  // Set up event listeners
  actorCore.useActorEvent(
    { actor: actorState.actor, event: "cursorMoved" },
    (...args: unknown[]) => {
      const event = args[0] as CursorEvent;
      setCursors(prev => ({ ...prev, [event.id]: event.cursor }));
    }
  );

  actorCore.useActorEvent(
    { actor: actorState.actor, event: "cursorAdded" },
    (...args: unknown[]) => {
      const event = args[0] as CursorEvent;
      setCursors(prev => ({ ...prev, [event.id]: event.cursor }));
    }
  );

  actorCore.useActorEvent(
    { actor: actorState.actor, event: "cursorRemoved" },
    (...args: unknown[]) => {
      const id = args[0] as string;
      setCursors(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  );

  // Initialize user
  useEffect(() => {
    if (actorState.state !== "created") return;

    const randomColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
    Promise.all([
      actorState.actor.setName(userName),
      actorState.actor.setColor(randomColor)
    ]);

    // Get initial cursors
    actorState.actor.getCursors().then(setCursors);
  }, [actorState, userName]);

  // Handle mouse movement
  useEffect(() => {
    if (actorState.state !== "created") return;

    const throttledMouseMove = throttle((event: MouseEvent) => {
      actorState.actor.updateCursor(event.clientX, event.clientY);
    }, THROTTLE_MS, { leading: true, trailing: true });

    window.addEventListener('mousemove', throttledMouseMove);
    return () => {
      throttledMouseMove.cancel();
      window.removeEventListener('mousemove', throttledMouseMove);
    };
  }, [actorState]);

  return (
    <>
      <div 
        className="min-h-screen text-white cursor-none" 
        style={{ 
          backgroundColor: BACKGROUND_COLOR,
          backgroundImage: `radial-gradient(#ffffff1a 1.5px, transparent 1.5px)`,
          backgroundSize: '32px 32px'
        }}
      >
        <div className="relative">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <h1 className="text-3xl mb-4 text-white flex items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3C3 3 17 9 17 9C17 9 12 11 12 11C12 11 9 17 9 17C9 17 3 3 3 3Z" />
              </svg>
              Live Cursor Demo
            </h1>
            <p className="text-base text-gray-400 mb-6 max-w-2xl">
              Built with the ActorCore framework. This demo showcases real-time state synchronization across multiple users with automatic persistence and low-latency updates.
            </p>
          </div>
          <CursorList cursors={cursors} />
        </div>
      </div>
      <CursorPointers cursors={cursors} />
    </>
  );
}

export default App;