import { ActorError } from "actor-core/errors";
import { EVENT_KEYS, LobbyManagerContext, LOCAL_LOBBY_ID } from "./mod";
import { currentState } from "./state";
import * as errors from "@/errors";
import type * as State from "@/utils/lobby_manager/state/mod";
import { assertUnreachable } from "actor-core/utils";
import invariant from "invariant";
import { LobbyConfig } from "@/config";
import {
	acceptAnyRegion,
	acceptAnyVersion,
	canCallLobbyReadyMultipleTimes,
	canMutateLobbies,
	getLobbyConfig,
	requiresLobbyToken,
} from "@/utils/lobby_config";
import {
	LobbyBackendResponse,
	LobbyResponse,
	lobbyTagsMatch,
} from "@/utils/lobby/mod";
import { Rivet } from "@rivet-gg/api";
import { regionsForBackend } from "@/utils/region";
import * as RpcSchema from "@/utils/lobby_manager/rpc";
import { createPlayers } from "./player";
import { createServerBackground, destroyServer } from "./server";
import { generateToken } from "@/utils/token";

export function getLobby(c: LobbyManagerContext, lobbyId: string) {
	const lobby = currentState(c).lobbies[lobbyId];
	if (lobby === undefined) {
		throw new errors.LobbyNotFoundError({ lobbyId });
	}
	return lobby;
}

export async function waitForLobbyReady(
	c: LobbyManagerContext,
	lobbyId: string,
): Promise<State.Lobby> {
	// Check the lobby state
	const { status, lobby: newLobby } = getLobbyStatus(c, lobbyId);
	switch (status) {
		case "unready":
			// Do nothing
			break;
		case "ready":
			invariant(
				newLobby !== undefined,
				"newLobby is undefined with ready state",
			);
			return newLobby;
		case "aborted": {
			const destroyMeta = c.vars.lobbyDestroyMeta[lobbyId];
			if (destroyMeta?.cause) {
				throw destroyMeta.cause;
			} else {
				throw new errors.LobbyAbortedError({
					reason: destroyMeta?.reason,
				});
			}
		}
		default:
			assertUnreachable(status);
	}

	// Wait for lobby to be ready
	//
	// If the lobby is never ready, it will time out from the GC destroying the
	// lobby.
	return await new Promise((resolve, reject) => {
		// Wait for lobby ready
		const unsubscribe = c.vars.emitter.on(
			EVENT_KEYS.lobbyUpdate(lobbyId),
			() => {
				const { status, lobby: newLobby } = getLobbyStatus(c, lobbyId);
				switch (status) {
					case "unready":
						// Do nothing
						break;
					case "ready":
						invariant(
							newLobby !== undefined,
							"newLobby is undefined with ready state",
						);
						unsubscribe();
						resolve(newLobby);
						break;
					case "aborted": {
						unsubscribe();

						const destroyMeta = c.vars.lobbyDestroyMeta[lobbyId];
						if (destroyMeta?.cause) {
							reject(destroyMeta.cause);
						} else {
							reject(
								new errors.LobbyAbortedError({ reason: destroyMeta?.reason }),
							);
						}
						break;
					}
					default:
						assertUnreachable(status);
				}
			},
		);
	});
}

/**
 * The state of the server.
 */
export function getLobbyStatus(
	c: LobbyManagerContext,
	lobbyId: string,
): {
	status: "unready" | "ready" | "aborted";
	lobby?: State.Lobby;
} {
	const lobby = currentState(c).lobbies[lobbyId];
	if (!lobby) {
		return { status: "aborted" };
	} else if (lobby.readyAt) {
		return { status: getLobbyBackendStatus(c, lobby), lobby };
	} else {
		return { status: "unready", lobby };
	}
}

/**
 * If the lobby backend is ready for players to start connecting.
 */
export function getLobbyBackendStatus(
	c: LobbyManagerContext,
	lobby: State.Lobby,
): "unready" | "ready" | "aborted" {
	if ("test" in lobby.backend) {
		return "ready";
	} else if ("localDevelopment" in lobby.backend) {
		return "ready";
	} else if ("rivet" in lobby.backend) {
		const server = currentState(c).servers[lobby.backend.rivet.serverId];
		if (server) {
			if (server.rivetActor) {
				return "ready";
			} else {
				return "unready";
			}
		} else {
			return "aborted";
		}
	} else {
		assertUnreachable(lobby.backend);
	}
}

export function resolveLobbyFromRequest(
	c: LobbyManagerContext,
	req: { lobbyId?: string; lobbyToken?: string },
): {
	lobbyId: string;
	hasLobbyToken: boolean;
} {
	// Validate token
	let lobbyId: string;
	let hasLobbyToken: boolean;
	if (req.lobbyToken) {
		lobbyId = lobbyForToken(c, req.lobbyToken);
		hasLobbyToken = true;
	} else if (req.lobbyId) {
		lobbyId = req.lobbyId;
		hasLobbyToken = false;
	} else if ("localDevelopment" in c.vars.config.lobbies.backend) {
		// Default to local lobby if neither lboby or token is provided
		lobbyId = LOCAL_LOBBY_ID;
		hasLobbyToken = false;
	} else {
		throw new errors.LobbyTokenRequiredError();
	}

	return { lobbyId, hasLobbyToken };
}

export function lobbyForToken(c: LobbyManagerContext, lobbyToken: string) {
	const lobby = Object.values(currentState(c).lobbies).find(
		(l) => l.token === lobbyToken,
	);
	if (!lobby) throw new errors.LobbyTokenInvalidError();
	return lobby.id;
}

export function playerForTokens(
	c: LobbyManagerContext,
	lobbyId: string,
	playerTokens: string[],
) {
	const lobby = getLobby(c, lobbyId);
	const players = Object.values(lobby.players).filter((p) =>
		playerTokens.includes(p.token),
	);
	if (playerTokens.length !== players.length)
		throw new errors.PlayerTokenInvalidError();
	return players.map((p) => p.id);
}

export function buildLobbyResponse(
	c: LobbyManagerContext,
	lobbyId: string,
): LobbyResponse {
	const lobby = getLobby(c, lobbyId);
	const lobbyConfig = getLobbyConfig(c.vars.config, lobby.tags);

	// Build backend
	let backend: LobbyBackendResponse;
	if ("test" in lobby.backend) {
		backend = { test: {} };
	} else if ("localDevelopment" in lobby.backend) {
		backend = {
			localDevelopment: {
				ports: lobby.backend.localDevelopment.ports,
			},
		};
	} else if ("rivet" in lobby.backend) {
		const server = currentState(c).servers[lobby.backend.rivet.serverId];
		if (!server) throw new Error("server not found");

		const rivetActor = server.rivetActor;
		if (rivetActor) {
			const ports: Record<string, Rivet.actor.Port> = {};
			for (const [k, v] of Object.entries(rivetActor.network.ports)) {
				ports[k] = {
					protocol: v.protocol,
					internalPort: v.internalPort,
					hostname: v.hostname,
					port: v.port,
					routing: v.routing,
				};
			}

			backend = {
				rivet: {
					serverId: lobby.backend.rivet.serverId,
					ports,
				},
			};
		} else {
			backend = {
				rivet: {
					serverId: lobby.backend.rivet.serverId,
					ports: {},
				},
			};
		}
	} else {
		assertUnreachable(lobby.backend);
	}

	// Get region
	const allRegions = regionsForBackend(lobbyConfig.backend);
	const region = allRegions.find((x) => x.slug === lobby.region);
	invariant(region !== undefined, "could not find region for lobby");

	return {
		id: lobby.id,
		version: lobby.version,
		tags: lobby.tags,
		region,
		createdAt: lobby.createdAt,
		readyAt: lobby.readyAt,
		players: Object.keys(lobby.players).length,
		maxPlayers: lobby.maxPlayers,
		maxPlayersDirect: lobby.maxPlayersDirect,
		backend,
	};
}

export function createLobby(
	c: LobbyManagerContext,
	req: {
		lobby: RpcSchema.LobbyRequest;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	},
): {
	lobbyId: string;
	playerIds: string[];
} {
	const lobbyConfig = getLobbyConfig(c.vars.config, req.lobby.tags ?? {});

	// Check lobby can be created
	if (!canMutateLobbies(lobbyConfig)) {
		throw new errors.CannotMutateLobbiesError();
	}

	if (req.players.length > req.lobby.maxPlayers) {
		throw new errors.MorePlayersThanMaxError();
	}

	if (
		lobbyConfig.destroyOnEmptyAfter !== null &&
		(!req.players.length || req.players.length === 0)
	) {
		throw new errors.LobbyCreateMissingPlayersError();
	}

	// Valiadte region
	const validRegions = regionsForBackend(lobbyConfig.backend);
	if (validRegions.findIndex((x) => x.slug === req.lobby.region) === -1) {
		throw new errors.RegionNotFoundError({
			region: req.lobby.region,
		});
	}

	// Create backend
	let backend: State.LobbyBackend;
	if ("test" in lobbyConfig.backend) {
		backend = { test: {} };
	} else if ("localDevelopment" in lobbyConfig.backend) {
		assertUnreachable(undefined as never);
	} else if ("rivet" in lobbyConfig.backend) {
		// Create backend
		const serverId = crypto.randomUUID();
		backend = {
			rivet: { serverId },
		};

		// Add server
		const server: State.Server = { id: serverId, createdAt: Date.now() };
		currentState(c).servers[server.id] = server;
	} else {
		assertUnreachable(lobbyConfig.backend);
	}

	// Create lobby
	const lobby: State.Lobby = {
		id: crypto.randomUUID(),
		token: generateToken("lobby"),
		version: req.lobby.version,
		region: req.lobby.region,
		tags: req.lobby.tags ?? {},
		createdAt: Date.now(),
		emptyAt: Date.now(),
		players: {},
		maxPlayers: req.lobby.maxPlayers,
		maxPlayersDirect: req.lobby.maxPlayersDirect,
		backend,
	};
	currentState(c).lobbies[lobby.id] = lobby;

	// Create players
	const { playerIds } = createPlayers(c, {
		lobbyId: lobby.id,
		players: req.players,
		remoteAddress: req.remoteAddress,
	});

	// Run background job
	//
	// This is because both requests finding & joining this lobby need to
	// wait for the background job to finish before returning.
	if ("rivet" in backend) {
		c.runInBackground(
			createServerBackground(c, lobby, lobbyConfig, backend.rivet.serverId),
		);
	}

	return { lobbyId: lobby.id, playerIds };
}

export function findLobby(
	c: LobbyManagerContext,
	req: {
		query: RpcSchema.QueryRequest;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	},
): {
	lobbyId: string;
	playerIds: string[];
} {
	const lobby = queryLobby(c, req.query, req.players.length);
	if (!lobby) {
		throw new errors.NoMatchingLobbiesError({
			playerCount: req.players.length,
			query: req.query,
		});
	}
	const { playerIds } = createPlayers(c, {
		lobbyId: lobby.id,
		players: req.players,
		remoteAddress: req.remoteAddress,
	});
	return { lobbyId: lobby.id, playerIds };
}

export function findOrCreateLobby(
	c: LobbyManagerContext,
	req: {
		query: RpcSchema.QueryRequest;
		lobby: RpcSchema.LobbyRequest;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	},
): {
	lobbyId: string;
	playerIds: string[];
} {
	const lobby = queryLobby(c, req.query, req.players.length);
	if (lobby) {
		const { playerIds } = createPlayers(c, {
			lobbyId: lobby.id,
			players: req.players,
			remoteAddress: req.remoteAddress,
		});
		return { lobbyId: lobby.id, playerIds };
	} else {
		return createLobby(c, {
			lobby: req.lobby,
			players: req.players,
			remoteAddress: req.remoteAddress,
		});
	}
}

export function setLobbyReady(
	c: LobbyManagerContext,
	req: RpcSchema.SetLobbyReadyRequest,
) {
	const { lobbyId, hasLobbyToken } = resolveLobbyFromRequest(c, req);

	// Get lobby. Fail gracefully since there may be a race condition with deleting lobby.
	const lobby = currentState(c).lobbies[lobbyId];
	if (!lobby) {
		c.log.warn("setting lobby ready on lobby that's already removed", {
			lobbyId: lobbyId,
		});
		return;
	}

	const lobbyConfig = getLobbyConfig(c.vars.config, lobby.tags);

	// Validate token
	if (!hasLobbyToken && requiresLobbyToken(lobbyConfig)) {
		throw new errors.LobbyTokenRequiredError();
	}

	// Update ready state
	if (lobby.readyAt !== undefined) {
		if (canCallLobbyReadyMultipleTimes(lobbyConfig)) {
			// Exit gracefully
			return;
		} else {
			throw new errors.LobbyAlreadyReadyError();
		}
	}

	lobby.readyAt = Date.now();

	c.vars.emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));
}

export function destroyLobby(
	c: LobbyManagerContext,
	req: { lobbyId: string; reason?: string; cause?: unknown },
) {
	// Get lobby
	const lobby = currentState(c).lobbies[req.lobbyId];
	if (!lobby) {
		throw new errors.LobbyNotFoundError({ lobbyId: req.lobbyId });
	}

	// Check can be deleted
	const lobbyConfig = getLobbyConfig(c.vars.config, lobby.tags);
	if (!canMutateLobbies(lobbyConfig)) {
		throw new errors.CannotMutateLobbiesError();
	}

	// TODO: Optimize
	// TODO: Handle backends better
	if ("test" in lobby.backend || "localDevelopment" in lobby.backend) {
		// Do nothing
	} else if ("rivet" in lobby.backend) {
		const serverId = lobby.backend.rivet.serverId;

		// Delete server
		const server = currentState(c).servers[serverId];
		if (server) {
			destroyServer(c, {
				serverId,
				reason: "destroy_lobby",
				destroyLobbies: false,
				destroyRivetActor: true,
			});
		} else {
			c.log.warn("did not find server to delete", { serverId: serverId });
		}
	} else {
		assertUnreachable(lobby.backend);
	}

	// Remove lobby
	delete currentState(c).lobbies[req.lobbyId];
	c.vars.lobbyDestroyMeta[req.lobbyId] = {
		destroyedAt: Date.now(),
		reason: req.reason,
		cause: req.cause,
	};

	c.vars.emitter.emit(EVENT_KEYS.lobbyUpdate(req.lobbyId));
}

/**
 * Finds a lobby for a given query.
 */
export function queryLobby(
	c: LobbyManagerContext,
	query: RpcSchema.QueryRequest,
	playerCount: number,
): State.Lobby | undefined {
	// TODO: optimize
	// Find largest lobby that can fit the requested players
	const lobbies = Object.values(currentState(c).lobbies)
		.map<[State.Lobby, LobbyConfig]>((lobby) => [
			lobby,
			getLobbyConfig(c.vars.config, lobby.tags),
		])
		.filter(
			([x, config]) => x.version === query.version || acceptAnyVersion(config),
		)
		.filter(
			([x, config]) =>
				query.regions === undefined ||
				query.regions.includes(x.region) ||
				acceptAnyRegion(config),
		)
		.filter(
			([x, _]) => Object.keys(x.players).length <= x.maxPlayers - playerCount,
		)
		.filter(
			([x, _]) =>
				query.tags === undefined || lobbyTagsMatch(query.tags, x.tags),
		)
		.map(([x, _]) => x)
		.sort((a, b) => b.createdAt - a.createdAt)
		.sort(
			(a, b) => Object.keys(b.players).length - Object.keys(a.players).length,
		);
	return lobbies[0];
}
