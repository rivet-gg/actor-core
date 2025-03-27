import type { SqlConnection } from "actor-core/sql";
import type { Database } from "better-sqlite3";

export class MemorySqlConnection implements SqlConnection {
	#raw: Database;

	// TODO: This is a temporary hack for Drizzle
	get HACK_raw(): unknown {
		return this.#raw;
	}

	constructor(db: Database) {
		this.#raw = db;
	}
}
