import { actor, setup } from "@/mod";
import { describe, test, expect } from "vitest";
import { setupTest } from "@/test/mod";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import { messages } from "./schemas/chat-room/schema";

describe("Actor SQLite Chat Room", () => {
	test("chat room with SQLite storage should work correctly", async () => {
		interface Message {
			username: string;
			message: string;
		}

		// Define actor with SQLite integration
		const chatRoom = actor({
			sql: true,
			createVars: (c) => ({
				drizzle: drizzle(c.sql.HACK_raw),
			}),
			onStart: (c) => {
				// Run migrations to create database schema
				migrate(c.vars.drizzle, {
					migrationsFolder: path.join(
						__dirname,
						"./schemas/chat-room/drizzle/",
					),
				});
			},
			actions: {
				// Send a message to the chat room
				sendMessage: async (c, username: string, message: string) => {
					// Insert message into database
					await c.vars.drizzle.insert(messages).values({
						username,
						message,
					});

					// Broadcast message to all connected clients
					c.broadcast("newMessage", username, message);
				},

				// Get a specific number of recent messages
				getMessages: async (c, count: number) => {
					// Query the most recent messages
					const result = await c.vars.drizzle
						.select()
						.from(messages)
						.orderBy(sql`${messages.createdAt} desc`)
						.limit(count);
					return result as Message[];
				},

				// Search for messages containing specific text
				searchMessages: async (c, searchTerm: string) => {
					// Query messages that contain the search term (simple implementation)
					const allMessages = await c.vars.drizzle.select().from(messages).orderBy(messages.createdAt);
					return allMessages.filter(
						(msg) =>
							msg.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
							msg.username.toLowerCase().includes(searchTerm.toLowerCase()),
					) as Message[];
				},

				// Clear all messages (for testing purposes)
				clearAllMessages: async (c) => {
					await c.vars.drizzle.delete(messages);
					return true;
				},
			},
		});

		// Set up the application with our chat room actor
		const app = setup({
			actors: { chatRoom },
		});

		// Initialize test environment
		const { client } = await setupTest(app);

		// Get instance of chat room
		const roomInstance = await client.chatRoom.get();

		// Initially, there should be no messages
		const initialMessages = await roomInstance.getMessages(10);
		expect(initialMessages).toEqual([]);

		// Set up event listener for newMessage events
		const receivedEvents: { username: string; message: string }[] = [];
		roomInstance.on("newMessage", (username: string, message: string) => {
			receivedEvents.push({ username, message });
		});

		// Send a single message
		const user1 = "alice";
		const message1 = "Hello, world!";
		await roomInstance.sendMessage(user1, message1);

		// Check event was emitted
		expect(receivedEvents).toEqual([{ username: user1, message: message1 }]);

		// Check message was stored in database
		const messagesAfterOne = await roomInstance.getMessages(10);
		expect(messagesAfterOne.length).toBe(1);
		expect(messagesAfterOne[0].username).toBe(user1);
		expect(messagesAfterOne[0].message).toBe(message1);

		// Send multiple messages
		const testUsers = ["bob", "charlie", "diana"];
		const testMessages = [
			"What a beautiful day!",
			"How are you doing?",
			"I'm learning about actor models",
		];

		// Send all test messages
		for (let i = 0; i < testUsers.length; i++) {
			await roomInstance.sendMessage(testUsers[i], testMessages[i]);
		}

		// Check all messages were stored correctly
		const allMessages = await roomInstance.getMessages(10);
		expect(allMessages.length).toBe(4); // initial + 3 new ones

		// Check first message is still there
		expect(allMessages[3].username).toBe(user1);
		expect(allMessages[3].message).toBe(message1);

		// Check new messages are there in order
		for (let i = 0; i < testUsers.length; i++) {
			expect(allMessages[2 - i].username).toBe(testUsers[i]);
			expect(allMessages[2 - i].message).toBe(testMessages[i]);
		}

		// Test getRecentMessages
		const recentMessages = await roomInstance.getMessages(2);
		expect(recentMessages.length).toBe(2);
		expect(recentMessages[0].username).toBe("diana");
		expect(recentMessages[1].username).toBe("charlie");

		// Test searchMessages
		const searchResults = await roomInstance.searchMessages("actor");
		expect(searchResults.length).toBe(1);
		expect(searchResults[0].username).toBe("diana");

		// Test search by username
		const userSearch = await roomInstance.searchMessages("bob");
		expect(userSearch.length).toBe(1);
		expect(userSearch[0].message).toBe("What a beautiful day!");

		// Test clearing all messages
		await roomInstance.clearAllMessages();
		const emptyMessages = await roomInstance.getMessages(10);
		expect(emptyMessages).toEqual([]);

		// Events should still contain the previous messages
		expect(receivedEvents.length).toBe(4);
	});
});

