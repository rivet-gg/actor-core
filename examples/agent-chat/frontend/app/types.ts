// Message types
export interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
}

// User types
export interface User {
  id: string;
  username: string;
  lastActive: number;
}

// Event types
export interface ChatRoomEvents {
  newMessage: Message;
  userJoined: { userId: string; username: string; timestamp: number };
  userLeft: { userId: string; username: string; timestamp: number };
  roomState: { messages: Message[]; users: User[]; roomName: string };
  typingStatus: { userId: string; username: string; isTyping: boolean };
}

// Connection types
export interface ConnectionParams {
  userId: string;
  username: string;
} 