import { SqlConnection } from "@/actor/sql/mod";
import { Database } from "better-sqlite3";

export class TestSqlConnection implements SqlConnection {
	#raw: Database;

	// TODO: This is a temporary hack for Drizzle
	get HACK_raw(): unknown {
		return this.#raw;
	}

	constructor(db: Database) {
		this.#raw = db;
	}
}
