import { sql } from "drizzle-orm";
import { sqliteTable as table, index } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";

export const messages = table(
	"messages",
	{
		id: t.int().primaryKey({ autoIncrement: true }),
		createdAt: t
			.int({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		username: t.text().notNull(),
		message: t.text().notNull(),
	},
	(t) => [index("created_at_idx").on(t.createdAt)],
);
