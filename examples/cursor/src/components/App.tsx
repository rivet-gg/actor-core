import { useEffect, useState } from 'react';
import { createClient, type ActorHandle } from 'actor-core/client';
import type { ActorCoreApp } from 'actor-core';
import { throttle } from 'lodash-es';
import CursorList from './CursorList';
import CursorPointers from './CursorPointers';
import type { App } from "../index";
import { type cursorRoom, CursorState } from '../cursor-room';

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
  const [room, setRoom] = useState<ActorHandle<typeof cursorRoom> | null>(null);
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const [userName] = useState(() => `User ${Math.floor(Math.random() * 10000)}`);

  useEffect(() => {
    let mounted = true;
    let currentRoom: ActorHandle<typeof cursorRoom> | null = null;

    const connect = async () => {
      try {
        const client = await createClient<App>("http://localhost:6420");
        const newRoom = await client.cursorRoom.get();
        if (mounted) {
          currentRoom = newRoom;
          setRoom(newRoom);
          const randomColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

          await Promise.all([
            newRoom.setName(userName),
            newRoom.setColor(randomColor)
          ]);

          // Subscribe to cursor events
          newRoom.on("cursorMoved", (event: CursorEvent) => {
            console.log('cursorMoved', event);
            setCursors(prev => ({ ...prev, [event.id]: event.cursor }));
          });

          newRoom.on("cursorAdded", (event: CursorEvent) => {
            setCursors(prev => ({ ...prev, [event.id]: event.cursor }));
          });

          newRoom.on("cursorRemoved", (id: string) => {
            setCursors(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          });

          // Get initial cursors
          const initialCursors = await newRoom.getCursors();
          setCursors(initialCursors);
        } else {
          // Component unmounted during connection, cleanup immediately
          await newRoom.dispose();
        }
      } catch (err) {
        console.error('Failed to connect:', err);
      }
    };

    connect();

    return () => {
      mounted = false;
      room?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!room) return;

    const throttledMouseMove = throttle((event: MouseEvent) => {
      room.updateCursor(event.clientX, event.clientY);
    }, THROTTLE_MS, { leading: true, trailing: true });

    window.addEventListener('mousemove', throttledMouseMove);
    return () => {
      throttledMouseMove.cancel(); // Properly cancel the throttled function
      window.removeEventListener('mousemove', throttledMouseMove);
    };
  }, [room]);

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