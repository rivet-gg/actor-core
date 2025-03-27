import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./tests/schemas/chat-room/drizzle",
	dialect: "sqlite",
	schema: "./tests/schemas/chat-room/schema.ts",
});
