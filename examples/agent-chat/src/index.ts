import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { serve } from "@actor-core/nodejs";
import { MemoryActorDriver, MemoryGlobalState } from "@actor-core/memory";
import { setup } from "actor-core";
import ChatRoom from "./chat-room.js";
import WebServerActor from "./web-server-actor.js";
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load and validate environment variables
config({ path: resolve(__dirname, '../.env') });

// Environment variable validation schema
const EnvSchema = z.object({
  PORT: z.string().transform(Number),
  HOST: z.string(),
  ACTOR_CORE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  CORS_ORIGIN: z.string()
});

async function startServer() {
  try {
    // Validate environment variables
    const env = EnvSchema.parse({
      PORT: process.env.PORT || '3000',
      HOST: process.env.HOST || 'localhost',
      ACTOR_CORE_LOG_LEVEL: process.env.ACTOR_CORE_LOG_LEVEL || 'info',
      CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3001'
    });

    // Initialize memory driver for local development
    const globalState = new MemoryGlobalState();
    const memoryDriver = new MemoryActorDriver(globalState);

    // Create ActorCore app instance
    const actors = {
      chat_room: ChatRoom,
      web_server: WebServerActor
    };

    const app = setup({
      actors,
    });

    console.log("Starting ActorCore server with actors:", Object.keys(actors));

    // Start the ActorCore server
    await serve(app, {
      topology: process.env.NODE_ENV === 'production' ? 'coordinate' : 'standalone',
      port: env.PORT,
      hostname: env.HOST,
      drivers: {
        actor: memoryDriver
      }
    });

    console.log(`ActorCore server running at http://${env.HOST}:${env.PORT}`);
    console.log('Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      ACTOR_CORE_LOG_LEVEL: env.ACTOR_CORE_LOG_LEVEL,
      CORS_ORIGIN: env.CORS_ORIGIN,
      PLATFORM: process.env.NODE_ENV === 'production' ? 'Rivet' : 'Local'
    });

  } catch (error) {
    console.error('Failed to start ActorCore server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 