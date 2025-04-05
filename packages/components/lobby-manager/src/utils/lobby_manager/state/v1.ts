import type { Rivet } from "@rivet-gg/api";

export interface State {
	lobbies: Record<string, Lobby>;
	servers: Record<string, Server>;
	lastGcAt: number;
	lastServerPollAt: number;
}

export interface Server {
	id: string;

	createdAt: number;

	/**
	 * Timestamp at which the Rivet create request returned.
	 *
	 * See `data.started_at` for the time at which the server actually started.
	 **/
	createCompleteAt?: number;

	/** Timestamp at which the data last polled. */
	polledAt?: number;

	/** If deletee request has been sent to Rivet, this will be set. */
	destroyedAt?: number;

	rivetActor?: {
		id: string;
		region: string;
		network: {
			ports: Record<
				string,
				{
					protocol: Rivet.actor.PortProtocol;
					internalPort?: number;
					hostname?: string;
					port?: number;
					routing: Rivet.actor.PortRouting;
				}
			>;
		};
	};
}

// MARK: Lobby
export interface Lobby {
	id: string;
	token: string;
	version: string;
	region: string;
	tags: Record<string, string>;

	createdAt: number;
	readyAt?: number;
	/**
	 * Timestamp at which the last player left the lobby.
	 */
	emptyAt?: number;

	players: Record<string, Player>;

	maxPlayers: number;
	maxPlayersDirect: number;

	backend: LobbyBackend;
}

export type LobbyBackend =
	| { test: LobbyBackendTest }
	| {
			localDevelopment: LobbyBackendLocalDevelopment;
	  }
	| { rivet: LobbyBackendServer };

// MARK: Player
export interface Player {
	id: string;
	token: string;
	lobbyId: string;
	createdAt: number;
	connectedAt?: number;
	remoteAddress?: string;
}

// MARK: Lobby Backend Test
export type LobbyBackendTest = Record<never, never>;

// MARK: Lobby Backend Development
export interface LobbyBackendLocalDevelopment {
	ports: Record<string, LobbyBackendLocalDevelopmentPort>;
}

export interface LobbyBackendLocalDevelopmentPort {
	protocol: LobbyBackendLocalDevelopmentPortProtocol;
	hostname: string;
	port: number;
}

export type LobbyBackendLocalDevelopmentPortProtocol = "http" | "tcp" | "udp";

// MARK: Lobby Backend Server
export interface LobbyBackendServer {
	serverId: string;
}
