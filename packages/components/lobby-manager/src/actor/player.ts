import { PlayerResponseWithToken } from "@/utils/player";
import type * as State from "@/utils/lobby_manager/state/mod";
import * as errors from "@/errors";
import { destroyLobby, getLobby } from "./lobby";
import { EVENT_KEYS, LobbyManagerContext } from "./mod";
import * as RpcSchema from "@/utils/lobby_manager/rpc";
import invariant from "invariant";
import { generateToken } from "@/utils/token";
import { Emitter } from "nanoevents";
import {
	canMutateLobbies,
	getLobbyConfig,
	requiresLobbyToken,
} from "@/utils/lobby_config";
import { currentState } from "./state";

export function buildPlayersResponse(
	c: LobbyManagerContext,
	lobbyId: string,
	playerIds: string[],
): PlayerResponseWithToken[] {
	const lobby = getLobby(c, lobbyId);

	const players = [];
	for (const playerId of playerIds) {
		const player = lobby.players[playerId];
		if (player) players.push({ id: playerId, token: player.token });
	}

	return players;
}

export function createPlayers(
	c: LobbyManagerContext,
	emitter: Emitter,
	req: {
		lobbyId: string;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	},
): { playerIds: string[] } {
	const lobby = getLobby(c, req.lobbyId);

	if (req.players.length === 0) {
		return { playerIds: [] };
	}

	// Check for too many players for IP
	if (c.vars.config.players.maxPerIp !== undefined) {
		// Count the number of IPs for the request
		const reqIpCounts = new Map<string, number>();
		for (const _player of req.players) {
			if (req.remoteAddress) {
				const count = reqIpCounts.get(req.remoteAddress) ?? 0;
				reqIpCounts.set(req.remoteAddress, count + 1);
			}
		}

		// Valdiate IPs
		for (const [ip, reqIpCount] of reqIpCounts) {
			const playersForIp = getPlayersForIp(c, ip);

			// Calculate the number of players over the max player count,
			// including the player making the request.
			const ipOverflow =
				playersForIp.length + reqIpCount - c.vars.config.players.maxPerIp;

			// Handle too many players per IP
			if (ipOverflow > 0) {
				// Before throwing an error, we'll try removing players
				// that have not connected to a server yet. This helps
				// mitigate the edge case where the game has a bug causing
				// players to fail to connect, leaving a lot of unconnected
				// players in the lobby manager. In this situation, new
				// players can still be created.
				//
				// If there are unconnected players that can be removed,
				// those players will be removed and this will continue as
				// normal.

				// Find players that have not connected yet, sorted oldest
				// to newest. This does not include the player that is
				// making the request.
				const unconnectedPlayersForIp = playersForIp
					.filter((x) => x.connectedAt === undefined)
					.sort((a, b) => a.createdAt - b.createdAt);

				// Check if there are enough players that we can delete to
				// make space for the new players
				if (unconnectedPlayersForIp.length >= ipOverflow) {
					c.log.warn(
						"removing unconnected player with the same ip to make space for new player. the game server is likely having issues accepting connections.",
						{
							ip: ip,
							ipOverflow: ipOverflow,
							maxPerIp: c.vars.config.players.maxPerIp,
						},
					);

					// Remove oldest players first in favor of the new
					// player we're about to add
					for (let i = 0; i < ipOverflow; i++) {
						invariant(
							unconnectedPlayersForIp[i] !== undefined,
							"no unconnected player for ip",
						);
						const unconnectedPlayer = unconnectedPlayersForIp[i];
						destroyPlayers(
							c,
							unconnectedPlayer.lobbyId,
							true,
							[unconnectedPlayer.id],
						);
					}
				} else {
					// Fail
					throw new errors.TooManyPlayersForIpError({ ip });
				}
			}
		}
	}

	// Check if we need to remove unconnected players
	if (c.vars.config.players.maxUnconnected !== undefined) {
		const unconnectedPlayers = getUnconnectedPlayers(c);

		const unconnectedOverflow =
			unconnectedPlayers.length +
			req.players.length -
			c.vars.config.players.maxUnconnected;
		if (unconnectedOverflow > 0) {
			// Calc number of players to remove
			const unconnectedPlayersToRemove = Math.min(
				unconnectedOverflow,
				unconnectedPlayers.length,
			);
			c.log.warn(
				"removing unconnected player to make space for new player. the game server is likely having issues accepting connections.",
				{
					maxUnconnected: c.vars.config.players.maxUnconnected,
					unconnectedOverflow: unconnectedOverflow,
					unconnectedPlayersToRemove: unconnectedPlayersToRemove,
				},
			);

			// Remove unconnected players from oldest to newest
			unconnectedPlayers.sort((a, b) => a.createdAt - b.createdAt);
			for (let i = 0; i < unconnectedPlayersToRemove; i++) {
				invariant(
					unconnectedPlayers[i] !== undefined,
					"no unconnected player for index",
				);
				const player = unconnectedPlayers[i];
				destroyPlayers(c,  player.lobbyId, true, [player.id]);
			}
		}
	}

	// Check for available spots in lobby
	if (lobby.maxPlayers - req.players.length < 0) {
		throw new errors.LobbyFullError({ lobbyId: req.lobbyId });
	}

	// Create players
	const players = [];
	for (const playerOpts of req.players) {
		const playerId = crypto.randomUUID();
		const player: State.Player = {
			id: playerId,
			token: generateToken("player"),
			lobbyId: lobby.id,
			createdAt: Date.now(),
			remoteAddress: req.remoteAddress,
		};
		lobby.players[player.id] = player;
		players.push(player);
	}

	// Make lobby not empty
	lobby.emptyAt = undefined;

	emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));

	return { playerIds: players.map((x) => x.id) };
}

export function destroyPlayers(
	c: LobbyManagerContext,
	lobbyId: string,
	hasLobbyToken: boolean,
	playerIds: string[],
) {
	const lobby = getLobby(c, lobbyId);
	const lobbyConfig = getLobbyConfig(c.vars.config, lobby.tags);

	// Validate token
	if (!hasLobbyToken && requiresLobbyToken(lobbyConfig)) {
		throw new errors.LobbyTokenRequiredError();
	}

	// Remove player
	for (const playerId of playerIds) {
		delete lobby.players[playerId];
	}

	// Destroy lobby immediately on empty
	if (Object.keys(lobby.players).length === 0) {
		lobby.emptyAt = Date.now();

		if (
			canMutateLobbies(lobbyConfig) &&
			lobbyConfig.destroyOnEmptyAfter === 0
		) {
			c.log.info("destroying empty lobby", {
				lobbyId: lobby.id,
				unreadyExpireAfter: c.vars.config.lobbies.unreadyExpireAfter,
			});
			destroyLobby(c,  {
				lobbyId: lobby.id,
				reason: "lobby_empty",
			});
		}
	}

	c.vars.emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));
}

export function setPlayersConnected(
	c: LobbyManagerContext,
	lobbyId: string,
	hasLobbyToken: boolean,
	playerIds: string[],
) {
	const lobby = getLobby(c, lobbyId);
	const lobbyConfig = getLobbyConfig(c.vars.config, lobby.tags);

	// Validate token
	if (!hasLobbyToken && requiresLobbyToken(lobbyConfig)) {
		throw new errors.LobbyTokenRequiredError();
	}

	// Validate players
	const allPlayers = [];
	for (const playerId of playerIds) {
		const player = lobby.players[playerId];
		if (player) {
			// TODO: Allow reusing connection token
			// TODO: What if the player already connected
			if (player.connectedAt !== undefined) {
				throw new errors.PlayerAlreadyConnectedError({
					lobbyId: lobby.id,
					playerId,
				});
			}

			allPlayers.push(player);
		} else {
			throw new errors.PlayerDisconnectedError({ lobbyId: lobby.id, playerId });
		}
	}

	// Update players
	for (const player of allPlayers) {
		player.connectedAt = Date.now();
	}
}

export function getPlayersForIp(
	c: LobbyManagerContext,
	ip: string,
): State.Player[] {
	// TODO: optimize
	const players = [];
	for (const lobby of Object.values(currentState(c).lobbies)) {
		for (const player of Object.values(lobby.players)) {
			if (player.remoteAddress === ip) {
				players.push(player);
			}
		}
	}
	return players;
}

export function getUnconnectedPlayers(c: LobbyManagerContext): State.Player[] {
	// TODO: optimize
	const players = [];
	for (const lobby of Object.values(currentState(c).lobbies)) {
		// Don't count unready lobbies since these players haven't had time to connect yet
		if (lobby.readyAt === undefined) continue;

		for (const player of Object.values(lobby.players)) {
			if (player.connectedAt === undefined) {
				players.push(player);
			}
		}
	}
	return players;
}
