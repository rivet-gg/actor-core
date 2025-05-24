import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client, type ActorHandle } from 'actor-core/client';
import { serve } from "@actor-core/nodejs";
import { MemoryActorDriver, MemoryGlobalState } from "@actor-core/memory";
import { ActorCoreApp, type ActorDefinition } from "actor-core";
import type { ChatRoomEvents, Message, User } from '../types';
import ChatRoom from '../chat-room.js';

interface ChatRoomHandle extends ActorHandle<typeof ChatRoom> {
  getRoomInfo(): Promise<{ name: string; userCount: number }>;
  sendMessage(content: string): Promise<Message>;
}

describe('ChatRoom Actor', () => {
  let app: ActorCoreApp<{ chat_room: typeof ChatRoom }>;
  let client: Client;
  const TEST_PORT = 3002;

  beforeEach(async () => {
    const globalState = new MemoryGlobalState();
    const memoryDriver = new MemoryActorDriver(globalState);

    app = new ActorCoreApp({
      actors: { chat_room: ChatRoom },
      maxConnParamLength: 4096,
      maxIncomingMessageSize: 1024 * 1024,
      actorPeer: {
        leaseDuration: 30000,
        renewLeaseGrace: 5000,
        checkLeaseInterval: 1000,
        checkLeaseJitter: 100,
        messageAckTimeout: 5000
      }
    });

    await serve(app, {
      topology: "standalone",
      port: TEST_PORT,
      hostname: 'localhost',
      drivers: { actor: memoryDriver }
    });

    client = new Client(`http://localhost:${TEST_PORT}`);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should connect to chat room using getForId', async () => {
    const roomId = 'test-room';
    const userId = 'test-user-1';
    const username = 'Test User';

    const chatRoom = await client.post('/manager/actors', {
      query: {
        getForId: {
          id: `chat_room_${roomId}`,
          name: 'chat_room'
        }
      },
      parameters: {
        userId,
        username
      }
    }) as ChatRoomHandle;

    expect(chatRoom).toBeDefined();
    const roomInfo = await chatRoom.getRoomInfo();
    expect(roomInfo.name).toBe(roomId);
  });

  it('should connect to chat room using getOrCreateForTags', async () => {
    const roomId = 'test-room-2';
    const userId = 'test-user-1';
    const username = 'Test User';

    const chatRoom = await client.post('/manager/actors', {
      query: {
        getOrCreateForTags: {
          name: 'chat_room',
          tags: roomId,
          create: {
            name: 'chat_room'
          }
        }
      },
      parameters: {
        userId,
        username
      }
    }) as ChatRoomHandle;

    expect(chatRoom).toBeDefined();
    const roomInfo = await chatRoom.getRoomInfo();
    expect(roomInfo.name).toBe(roomId);
  });

  it('should reject duplicate usernames in same room', async () => {
    const roomId = 'test-room-3';
    const username = 'Same User';

    // Connect first user
    await client.post('/manager/actors', {
      query: {
        getForId: {
          id: `chat_room_${roomId}`,
          name: 'chat_room'
        }
      },
      parameters: {
        userId: 'user-1',
        username
      }
    });

    // Try connecting second user with same username
    await expect(
      client.post('/manager/actors', {
        query: {
          getForId: {
            id: `chat_room_${roomId}`,
            name: 'chat_room'
          }
        },
        parameters: {
          userId: 'user-2',
          username
        }
      })
    ).rejects.toThrow('Username is already taken');
  });
}); 