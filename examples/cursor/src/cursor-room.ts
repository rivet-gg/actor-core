import { actor, type ActionContext } from "actor-core";
import type { ActorHandle } from 'actor-core/client';

export interface CursorState {
  color: string;
  name?: string;
  x: number;
  y: number;
}

interface State {
  cursors: Record<string, CursorState>;
}

export const cursorRoom = actor({
  state: {
    cursors: {},
  } as State,

  actions: {
    async getCursors(c) {
      console.log('getCursors - Current connections:', Array.from(c.conns.keys()));
      console.log('getCursors - Current cursors:', Object.keys(c.state.cursors));
      return c.state.cursors;
    },

    async updateCursor(c, x: number, y: number) {
      const id = c.conn.id;
      console.log('updateCursor - Using connection:', id);

      // Simply update cursor position
      c.state.cursors[id] = {
        ...c.state.cursors[id],
        x,
        y,
      };

      console.log('updateCursor - Cursor state:', c.state.cursors[id]);
      c.broadcast("cursorMoved", {
        id,
        cursor: c.state.cursors[id],
      });
    },

    async setName(c, name: string) {
      const id = c.conn.id;
      console.log('setName - Using connection:', id, name);
      
      const cursor = c.state.cursors[id];
      if (cursor) {
        cursor.name = name;
        c.broadcast("cursorMoved", {
          id,
          cursor,
        });
      } else {
        console.error('setName - Cursor not found for connection:', id);
      }
    },

    async setColor(c, color: string) {
      const id = c.conn.id;
      console.log('setColor - Using connection:', id);
      
      const cursor = c.state.cursors[id];
      if (cursor) {
        cursor.color = color;
        c.broadcast("cursorMoved", {
          id,
          cursor,
        });
      } else {
        console.error('setColor - Cursor not found for connection:', id);
      }
    },
  },

  onConnect(c, conn) {
    const id = conn.id;
    console.log('onConnect - All connections:', Array.from(c.conns.keys()));
    console.log('onConnect - Using connection:', id);
    
    // Create cursor immediately on connect
    c.state.cursors[id] = {
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      x: 0,
      y: 0,
    };
    console.log('onConnect - Created cursor:', c.state.cursors[id]);
  },

  onDisconnect(c, conn) {
    const id = conn.id;
    console.log('onDisconnect - Connection disconnected:', id);
    
    // Remove the cursor for this connection
    delete c.state.cursors[id];
    
    // Broadcast removal to all remaining connections
    c.broadcast("cursorRemoved", id);
  },
});