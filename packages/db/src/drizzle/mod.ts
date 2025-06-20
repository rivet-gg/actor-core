import { drizzle } from "drizzle-orm/better-sqlite3";
import * as Database from "better-sqlite3";

export * from "drizzle-orm/sqlite-core";

interface DbConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
> {
	/**
	 * The database schema.
	 */
	schema?: TSchema;
}

export function db<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(config?: DbConfig<TSchema>) {
	const db = drizzle({ client: new Database(), ...config });

	return db;
}
