import * as Database from "better-sqlite3";

export function db(): Database.Database {
	// This is a placeholder function to indicate that this module is part of the db package.
	// It can be used to import the db package without any specific functionality

	const sqlite = new Database("sqlite.db");

	return sqlite;
}
