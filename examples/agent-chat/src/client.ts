// import { Client, ActorHandle } from "actor-core/client";
// import type ChatRoom from "./chat-room.js";
// import { z } from 'zod';

// // Validation schemas
// const UserInputSchema = z.object({
//   username: z.string().min(1, "Username cannot be empty"),
//   roomId: z.string().default("general")
// });

// type UserInput = z.infer<typeof UserInputSchema>;

// // Message event types
// interface MessageEvent {
//   username: string;
//   content: string;
//   timestamp: number;
// }

// interface UserEvent {
//   username: string;
// }

// interface RoomState {
//   roomName: string;
//   users: string[];
//   messages: MessageEvent[];
// }

// /**
//  * Command-line chat client
//  * Demonstrates ActorCore client usage with proper error handling
//  */
// class ChatClient {
//   private client: Client;
//   private chatRoom: ActorHandle<ChatRoom> | null = null;
//   private isConnected = false;

//   constructor(apiUrl: string = 'http://localhost:3000') {
//     this.client = new Client(apiUrl);
//   }

//   /**
//    * Connect to a chat room
//    * @throws {Error} If connection fails
//    */
//   public async connect(input: UserInput): Promise<void> {
//     try {
//       // Validate input
//       const validatedInput = UserInputSchema.parse(input);
      
//       const userId = `user_${Math.floor(Math.random() * 10000)}`;
      
//       // Connect to chat room with consistent actor ID
//       const actorId = `chat_room_${validatedInput.roomId}`;
//       this.chatRoom = await this.client.get<ChatRoom>({
//         id: actorId,
//         name: "chat_room",
//         roomId: validatedInput.roomId
//       }, {
//         parameters: {
//           userId,
//           username: validatedInput.username
//         }
//       });
      
//       this.isConnected = true;
      
//       // Set up event listeners
//       this.setupEventListeners();
      
//       console.log(`Connected to room: ${validatedInput.roomId}`);
      
//     } catch (error) {
//       if (error instanceof z.ZodError) {
//         throw new Error(`Invalid input: ${error.errors.map(e => e.message).join(", ")}`);
//       }
//       throw error;
//     }
//   }

//   /**
//    * Send a message to the chat room
//    * @throws {Error} If not connected or message fails to send
//    */
//   public async sendMessage(content: string): Promise<void> {
//     if (!this.isConnected || !this.chatRoom) {
//       throw new Error("Not connected to chat room");
//     }

//     try {
//       await this.chatRoom.sendMessage(content);
//     } catch (error) {
//       console.error("Failed to send message:", error);
//       throw error;
//     }
//   }

//   /**
//    * Disconnect from the chat room
//    */
//   public async disconnect(): Promise<void> {
//     if (this.chatRoom) {
//       // Close the connection and cleanup
//       this.chatRoom = null;
//       this.isConnected = false;
//       console.log("Disconnected from chat room");
//     }
//   }

//   /**
//    * Set up event listeners for the chat room
//    * @private
//    */
//   private setupEventListeners(): void {
//     if (!this.chatRoom) return;

//     // Listen for new messages
//     this.chatRoom.on("newMessage", (message: MessageEvent) => {
//       console.log(
//         `[${new Date(message.timestamp).toLocaleTimeString()}] ${message.username}: ${message.content}`
//       );
//     });

//     // Listen for user joined events
//     this.chatRoom.on("userJoined", (data: UserEvent) => {
//       console.log(`[SYSTEM] ${data.username} joined the room`);
//     });

//     // Listen for user left events
//     this.chatRoom.on("userLeft", (data: UserEvent) => {
//       console.log(`[SYSTEM] ${data.username} left the room`);
//     });

//     // Listen for room state
//     this.chatRoom.on("roomState", (state: RoomState) => {
//       console.log(`Room: ${state.roomName}`);
//       console.log(`Users online: ${state.users.length}`);

//       if (state.messages.length > 0) {
//         console.log("\nRecent messages:");
//         state.messages.forEach((msg: MessageEvent) => {
//           console.log(
//             `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.username}: ${msg.content}`
//           );
//         });
//       }

//       console.log("\nType your message and press Enter to send. Type '/exit' to quit.");
//     });
//   }
// }

// // Create and export a singleton instance
// export const chatClient = new ChatClient(); 