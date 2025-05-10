import { actor, UserError, type ActionContext, type ActorContext, type OnConnectOptions } from "actor-core";
import { AIService } from './ai-service.js';
import { z } from 'zod';

// Event types for type safety
export interface ChatRoomEvents {
  newMessage: Message;
  userJoined: { userId: string; username: string; timestamp: number };
  userLeft: { userId: string; username: string; timestamp: number };
  roomState: { messages: Message[]; users: User[]; roomName: string };
  typingStatus: { userId: string; username: string; isTyping: boolean };
}

// Message schema for validation
const MessageSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  username: z.string().min(1),
  content: z.string().min(1),
  timestamp: z.number().int().positive()
});

// User schema for validation
const UserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  lastActive: z.number().int().positive()
});

// Connection parameter schema
const ConnectionParamsSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1)
});

// Define the types for our chat room state
export type Message = z.infer<typeof MessageSchema>;
export type User = z.infer<typeof UserSchema>;
export type ConnectionParams = z.infer<typeof ConnectionParamsSchema>;
export type ConnectionState = ConnectionParams;

export interface State {
  messages: Message[];
  users: Record<string, User>;
  roomName: string;
  claudeUserId: string;
  typingUsers: Record<string, number>;
}

interface Actions {
  [key: string]: (...args: any[]) => any;
  sendMessage: (ctx: ActionContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>, content: string) => Promise<Message>;
  getUsers: (ctx: ActionContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>) => Promise<User[]>;
  getRoomInfo: (ctx: ActionContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>) => Promise<{ name: string; userCount: number }>;
  setTypingStatus: (ctx: ActionContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>, isTyping: boolean) => Promise<void>;
}

// Configuration constants
const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_USERS_PER_ROOM = 50;

/**
 * ChatRoom Actor
 * 
 * Handles real-time chat functionality with the following features:
 * - User management (join/leave)
 * - Message broadcasting
 * - Typing indicators
 * - AI integration
 * - Message history management
 */
export default actor<State, ConnectionParams, ConnectionState, ChatRoomEvents, Actions>({
  createState: () => ({
    messages: [],
    users: {
      [crypto.randomUUID()]: {
        id: crypto.randomUUID(),
        username: "Claude",
        lastActive: Date.now()
      }
    },
    roomName: "general",
    claudeUserId: crypto.randomUUID(),
    typingUsers: {}
  }),

  onBeforeConnect: async (c: ActorContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>, opts: OnConnectOptions<ConnectionParams>) => {
    try {
      // Check room capacity
      if (Object.keys(c.state.users).length >= MAX_USERS_PER_ROOM) {
        throw new UserError("Room is at maximum capacity", {
          metadata: {
            code: "room_full",
            roomName: c.state.roomName,
            maxUsers: MAX_USERS_PER_ROOM
          }
        });
      }

      // Validate connection parameters
      const validatedParams = ConnectionParamsSchema.parse(opts);

      // Check if username is already taken
      const isUsernameTaken = Object.values(c.state.users).some(
        user => user.username.toLowerCase() === validatedParams.username.toLowerCase()
      );

      if (isUsernameTaken) {
        throw new UserError("Username is already taken", {
          metadata: {
            code: "username_taken",
            username: validatedParams.username
          }
        });
      }
    } catch (error) {
      if (error instanceof UserError) {
        throw error;
      }
      throw new UserError("Invalid connection parameters", { 
        metadata: { 
          code: "invalid_credentials",
          error: error instanceof z.ZodError ? error.errors : error
        }
      });
    }
  },

  onConnect: async (c: ActorContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>) => {
    const conn = Array.from(c.conns.values())[0];
    if (!conn) return;

    const { userId, username } = conn.state;
    
    // Add user to the room
    const user: User = {
      id: userId,
      username,
      lastActive: Date.now()
    };
    
    c.state.users[userId] = user;
    
    // Broadcast user joined event
    c.broadcast("userJoined", {
      userId,
      username,
      timestamp: Date.now()
    });
    
    // Send current room state to the new user
    c.broadcast("roomState", {
      messages: c.state.messages.slice(-50), // Send last 50 messages
      users: Object.values(c.state.users),
      roomName: c.state.roomName
    }, [userId]); // Send only to this user
    
    c.log.info("user_connected", { userId, username, roomName: c.state.roomName });
  },

  onDisconnect: async (c: ActorContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>) => {
    const conn = Array.from(c.conns.values())[0];
    if (!conn) return;

    const { userId } = conn.state;
    
    // Clean up typing status
    if (c.state.typingUsers[userId]) {
      c.state.typingUsers[userId] = 0; // Clear typing status
    }
    
    // Remove user from room
    const user = c.state.users[userId];
    if (!user) {
      c.log.warn("user_not_found_on_disconnect", { userId });
      return;
    }

    delete c.state.users[userId];
    
    // Broadcast user left event
    c.broadcast("userLeft", {
      userId,
      username: user.username,
      timestamp: Date.now()
    });
  },

  actions: {
    async sendMessage(c: ActionContext<State, ConnectionParams, ConnectionState, ChatRoomEvents>, content: string): Promise<Message> {
      const conn = Array.from(c.conns.values())[0];
      if (!conn) throw new UserError("Not connected");

      const { userId, username } = conn.state;
      
      // Validate message content
      if (!content.trim()) {
        throw new UserError("Message content cannot be empty");
      }
      
      if (content.length > MAX_MESSAGE_LENGTH) {
        throw new UserError(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
      }
      
      // Create new message
      const message: Message = {
        id: crypto.randomUUID(),
        userId,
        username,
        content: content.trim(),
        timestamp: Date.now()
      };
      
      // Update user's last active time
      c.state.users[userId].lastActive = Date.now();
      
      // Add message to history
      c.state.messages.push(message);
      
      // Trim message history if needed
      if (c.state.messages.length > MAX_MESSAGES) {
        c.state.messages = c.state.messages.slice(-MAX_MESSAGES);
      }
      
      // Clear typing status
      if (c.state.typingUsers[userId]) {
        c.state.typingUsers[userId] = 0; // Clear typing status
      }
      
      // Broadcast new message to all users
      c.broadcast("newMessage", message);
      
      // If message mentions Claude, trigger AI response
      if (content.toLowerCase().includes("@claude")) {
        try {
          const aiService = (undefind as any)// AIService.getInstance();
          const aiResponse = await aiService.processMessage(message, c.state.roomName);
          
          if (aiResponse) {
            const claudeMessage: Message = {
              id: crypto.randomUUID(),
              userId: c.state.claudeUserId,
              username: "Claude",
              content: aiResponse,
              timestamp: Date.now()
            };
            
            c.state.messages.push(claudeMessage);
            c.broadcast("newMessage", claudeMessage);
          }
        } catch (error) {
          c.log.error("claude_response_error", { error });
        }
      }
      
      return message;
    },

    async getUsers(c): Promise<User[]> {
      return Object.values(c.state.users);
    },

    async getRoomInfo(c): Promise<{ name: string; userCount: number }> {
      return {
        name: c.state.roomName,
        userCount: Object.keys(c.state.users).length
      };
    },

    async setTypingStatus(c, isTyping: boolean): Promise<void> {
      const conn = Array.from(c.conns.values())[0];
      if (!conn) return;

      const { userId, username } = conn.state;
      
      if (isTyping) {
        // Update typing status with current timestamp
        c.state.typingUsers[userId] = Date.now();
      } else {
        // Remove typing status
        delete c.state.typingUsers[userId];
      }
      
      // Broadcast typing status change
      c.broadcast("typingStatus", {
        userId,
        username,
        isTyping
      });
    }
  }
}); 