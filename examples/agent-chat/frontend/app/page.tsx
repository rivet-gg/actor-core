"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { createClient, ActorHandle, type AnyActorDefinition, type EventUnsubscribe } from "actor-core/client";
import type { Message, User, ChatRoomEvents } from "./types";
import type ChatRoom from "../../src/chat-room.js";

// Use ws:// for development, wss:// for production
const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'wss://localhost:3000' : 'ws://localhost:3000');

interface ChatRoomHandle extends ActorHandle<typeof ChatRoom> {
  sendMessage(content: string): Promise<Message>;
  disconnect(): Promise<void>;
  setTypingStatus(isTyping: boolean): Promise<void>;
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("general");
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  
  const chatRoomRef = useRef<ChatRoomHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [client] = useState(() => createClient(API_URL));

  const connectToRoom = async () => {
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const userId = `user_${Math.floor(Math.random() * 10000)}`;
      
      // Connect to chat room
      const chatRoom = await client.get<typeof ChatRoom>({
        id: `chat_room_${roomId || "general"}`,
        name: "chat_room",
        roomId: roomId || "general"
      }, {
        parameters: {
          userId,
          username: username.trim()
        }
      });
      
      chatRoomRef.current = chatRoom;
      
      // Listen for new messages
      chatRoom.on("newMessage", (message: Message) => {
        // Check if we've already processed this message
        if (!processedMessageIds.current.has(message.id)) {
          processedMessageIds.current.add(message.id);
          setMessages(prev => [...prev, message]);
        }
      });
      
      // Listen for user joined events
      chatRoom.on("userJoined", (data: any) => {
        setUsers(prev => {
          // Check if user already exists
          if (prev.some(user => user.id === data.userId)) {
            return prev;
          }
          return [...prev, { id: data.userId, username: data.username, lastActive: data.timestamp }];
        });
      });
      
      // Listen for user left events
      chatRoom.on("userLeft", (data: any) => {
        setUsers(prev => prev.filter(user => user.id !== data.userId));
      });
      
      // Listen for room state
      chatRoom.on("roomState", (state: any) => {
        // Reset processed message IDs
        processedMessageIds.current.clear();
        // Add all message IDs from the state
        state.messages.forEach((msg: Message) => {
          processedMessageIds.current.add(msg.id);
        });
        setMessages(state.messages);
        setUsers(state.users);
        setConnected(true);
      });
      
      // Listen for typing status
      chatRoom.on("typingStatus", (data: { userId: string; username: string; isTyping: boolean }) => {
        setTypingUsers(prev => {
          if (data.isTyping) {
            if (!prev.includes(data.username)) {
              return [...prev, data.username];
            }
            return prev;
          } else {
            return prev.filter(username => username !== data.username);
          }
        });
      });
      
      setLoading(false);
    } catch (err: any) {
      setError(`Error connecting: ${err.message}`);
      setLoading(false);
    }
  };
  
  const sendMessage = async () => {
    if (!message.trim() || !chatRoomRef.current) return;
    
    const currentMessage = message;
    setMessage(""); // Clear message immediately
    
    try {
      await chatRoomRef.current.sendMessage(currentMessage);
    } catch (err: any) {
      setError(`Error sending message: ${err.message}`);
      setMessage(currentMessage); // Restore message if there was an error
    }
  };
  
  const disconnect = async () => {
    if (chatRoomRef.current) {
      await chatRoomRef.current.disconnect();
      chatRoomRef.current = null;
      setConnected(false);
      setMessages([]);
      setUsers([]);
      processedMessageIds.current.clear();
    }
  };
  
  // Handle user typing
  const handleTyping = () => {
    if (chatRoomRef.current) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Send typing status
      chatRoomRef.current.setTypingStatus(true).catch((err: Error) => {
        console.error("Error setting typing status:", err);
      });
      
      // Set timeout to clear typing status
      typingTimeoutRef.current = setTimeout(() => {
        if (chatRoomRef.current) {
          chatRoomRef.current.setTypingStatus(false).catch((err: Error) => {
            console.error("Error clearing typing status:", err);
          });
        }
      }, 3000); // Clear after 3 seconds of no typing
    }
  };

  // Update input handler to include typing status
  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    handleTyping();
  };
  
  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#94AB98] font-[family-name:var(--font-geist-sans)]">
      {!connected ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-md bg-[#879E8C] rounded-3xl p-8 space-y-8 border border-[#657E68]/20 animate-fade-in">
            <h1 className="text-4xl font-extrabold text-center text-black mb-8 animate-slide-down">AI Chat Room</h1>
            <p className="text-center text-[#657E68] animate-fade-in-delay">Powered by ActorCore</p>
            
            {error && (
              <div className="p-4 bg-red-100 border border-red-200 text-red-700 rounded-2xl text-sm animate-shake">
                {error}
              </div>
            )}
            
            <div className="space-y-4 animate-slide-up">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#657E68]">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-4 bg-white/30 border border-[#657E68]/30 rounded-2xl focus:ring-2 focus:ring-[#657E68] focus:border-[#657E68] outline-none transition-all duration-300 text-black placeholder-[#657E68]"
                  placeholder="Enter username"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#657E68]">Room ID</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full p-4 bg-white/30 border border-[#657E68]/30 rounded-2xl focus:ring-2 focus:ring-[#657E68] focus:border-[#657E68] outline-none transition-all duration-300 text-black placeholder-[#657E68]"
                  placeholder="general"
                />
              </div>
            </div>
            
            <button
              onClick={connectToRoom}
              disabled={loading}
              className="w-full p-4 bg-black text-white rounded-2xl hover:bg-black/80 disabled:bg-[#657E68] disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] font-medium animate-slide-up-delay cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </span>
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="h-screen flex flex-col bg-[#94AB98]">
          <header className="px-6 py-4 bg-[#94AB98] border-b border-[#657E68]/20 animate-slide-down">
            <div className="max-w-6xl mx-auto flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-extrabold text-black">
                  {roomId || "general"}
                </h1>
                <span className="px-4 py-2 bg-black/10 rounded-2xl text-sm text-black flex items-center gap-2 animate-pulse">
                  <span className="w-2 h-2 bg-black rounded-full"></span>
                  Claude AI
                </span>
              </div>
              <button 
                onClick={disconnect}
                className="px-4 py-2 text-sm font-medium text-black hover:bg-black/10 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          </header>
          
          <main className="flex-1 overflow-y-auto px-6 py-4 bg-[#94AB98]">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="text-center py-3 animate-fade-in">
                <span className="text-sm text-[#657E68]">Type @claude followed by your message to chat with Claude AI</span>
              </div>
              {messages.map((msg, index) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.username === username ? "justify-end" : "justify-start"} animate-message-in`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`max-w-[80%] rounded-2xl px-6 py-4 transform transition-all duration-300 hover:scale-[1.01] ${
                    msg.username === username 
                      ? "bg-black text-white" 
                      : msg.username === "Claude"
                      ? "bg-[#879E8C] text-black border border-[#657E68]/20"
                      : "bg-[#879E8C] text-black border border-[#657E68]/20"
                  }`}
                  >
                    <div className={`text-sm font-medium flex items-center gap-2 ${
                      msg.username === username 
                        ? "text-white/90" 
                        : "text-[#657E68]"
                    }`}>
                      {msg.username}
                      {msg.username === "Claude" && (
                        <svg className="w-4 h-4 text-[#657E68] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap">{msg.content}</div>
                    <div className={`text-xs mt-2 ${
                      msg.username === username 
                        ? "text-white/70" 
                        : "text-[#657E68]"
                    }`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {Object.entries(typingUsers).map(([userId, typingUsername]) => (
                <div key={`typing-${userId}`} className="flex justify-start animate-fade-in">
                  <div className={`max-w-[80%] rounded-2xl px-6 py-4 bg-[#879E8C] border border-[#657E68]/20`}>
                    <div className="text-sm font-medium flex items-center gap-2 text-[#657E68]">
                      {typingUsername}
                      <span className="flex gap-2">
                        <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                        <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </main>
          
          <footer className="px-6 py-2 border-t border-[#657E68]/20 animate-slide-up">
            <div className="max-w-3xl mx-auto">
              {error && (
                <div className="mb-2 p-3 bg-red-100 border border-red-200 text-red-700 rounded-2xl text-sm animate-shake">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={handleMessageChange}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  className="flex-1 p-2 bg-white/30 border border-[#657E68]/30 rounded-xl focus:ring-2 focus:ring-[#657E68] focus:border-[#657E68] outline-none transition-all duration-300 text-black placeholder-[#657E68] text-sm"
                  placeholder="Type your message..."
                />
                <button
                  onClick={sendMessage}
                  className="px-4 py-2 bg-black text-white font-medium rounded-xl hover:bg-black/80 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] flex-shrink-0 text-sm cursor-pointer"
                >
                  Send
                </button>
              </div>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
