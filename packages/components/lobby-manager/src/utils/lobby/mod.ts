import type { Region } from "../region";
import type { LobbyBackendLocalDevelopmentResponse } from "./backend/local_development";
import type { LobbyBackendRivetResponse } from "./backend/rivet";
import type { LobbyBackendTestResponse } from "./backend/test";

/**
 * Check if a lobby with the given tags matches a query.
 */
export function lobbyTagsMatch(
	query: Record<string, string>,
	target: Record<string, string>,
): boolean {
	for (const key in query) {
		if (target[key] !== query[key]) return false;
	}
	return true;
}

export interface LobbyResponse {
	id: string;
	version: string;
	tags: Record<string, string>;
	region: Region;

	createdAt: number;
	readyAt?: number;

	players: number;
	maxPlayers: number;
	maxPlayersDirect: number;

	backend: LobbyBackendResponse;
}

export type LobbyBackendResponse =
	| { test: LobbyBackendTestResponse }
	| {
			localDevelopment: LobbyBackendLocalDevelopmentResponse;
	  }
	| { rivet: LobbyBackendRivetResponse };
