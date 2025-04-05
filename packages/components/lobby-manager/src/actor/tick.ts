import { getLobbyConfig } from "@/utils/lobby_config";
import type { LobbyManagerContext } from "./mod";
import { pollServers } from "./server";
import { currentState } from "./state";
import { destroyLobby } from "./lobby";
import { canMutateLobbies } from "@/utils/lobby_config";
import { destroyPlayers } from "./player";

export async function tick(c: LobbyManagerContext) {
	c.schedule.after(c.vars.config.tickInterval, "tick");

	const now = Date.now();
	if (now - currentState(c).lastGcAt >= c.vars.config.gcInterval) {
		currentState(c).lastGcAt = now;
		await gc(c);
	}
	if (
		now - currentState(c).lastServerPollAt >=
		c.vars.config.pollServersInterval
	) {
		currentState(c).lastServerPollAt = now;
		await pollServers(c);
	}
}

export async function gc(c: LobbyManagerContext) {
	const state = currentState(c);

	// GC destroy meta
	let expiredLobbyDestroyMeta = 0;
	for (const [lobbyId, meta] of Object.entries(c.vars.lobbyDestroyMeta)) {
		if (Date.now() - meta.destroyedAt > 180_000) {
			expiredLobbyDestroyMeta++;
			delete c.vars.lobbyDestroyMeta[lobbyId];
		}
	}

	// GC lobbies
	let unreadyLobbies = 0;
	let emptyLobbies = 0;
	let unconnectedPlayers = 0;
	let oldPlayers = 0;
	for (const lobby of Object.values(state.lobbies)) {
		const lobbyConfig = getLobbyConfig(c.vars.config, lobby.tags);

		// Destroy lobby if unready
		if (
			canMutateLobbies(lobbyConfig) &&
			lobby.readyAt === undefined &&
			Date.now() - lobby.createdAt > c.vars.config.lobbies.unreadyExpireAfter
		) {
			c.log.warn("destroying unready lobby", {
				lobbyId: lobby.id,
				unreadyExpireAfter: c.vars.config.lobbies.unreadyExpireAfter,
			});
			destroyLobby(c, {
				lobbyId: lobby.id,
				reason: "lobby_ready_timeout",
			});
			unreadyLobbies++;
			continue;
		}

		// Destroy lobby if empty for long enough
		if (
			canMutateLobbies(lobbyConfig) &&
			lobbyConfig.destroyOnEmptyAfter !== null &&
			lobby.emptyAt !== undefined &&
			Date.now() - lobby.emptyAt > lobbyConfig.destroyOnEmptyAfter
		) {
			c.log.debug("destroying empty lobby", {
				lobbyId: lobby.id,
				unreadyExpireAfter: c.vars.config.lobbies.unreadyExpireAfter,
			});
			destroyLobby(c,{ lobbyId: lobby.id, reason: "lobby_empty" });
			emptyLobbies++;
			continue;
		}

		if (lobby.readyAt !== undefined) {
			for (const player of Object.values(lobby.players)) {
				// If joining a preemptively created lobby, the player's
				// created timestamp will be earlier than when the lobby
				// actually becomes able to be connected to.
				//
				// GC players based on the timestamp the lobby started if
				// needed.
				const startAt = Math.max(player.createdAt, lobby.readyAt);

				// Clean up unconnected players
				if (
					player.connectedAt === undefined &&
					Date.now() - startAt > c.vars.config.players.unconnectedExpireAfter
				) {
					c.log.debug("destroying unconnected player", {
						playerId: player.id,

						unconnectedExpireAfter:
							c.vars.config.players.unconnectedExpireAfter,
					});
					destroyPlayers(c,player.lobbyId, true, [player.id]);
					unconnectedPlayers++;
					continue;
				}

				// Clean up really old players
				if (
					c.vars.config.players.autoDestroyAfter !== undefined &&
					Date.now() - startAt > c.vars.config.players.autoDestroyAfter
				) {
					c.log.warn("destroying old player", {
						playerId: player.id,
						autoDestroyAfter: c.vars.config.players.autoDestroyAfter,
					});
					destroyPlayers(c,player.lobbyId, true, [player.id]);
					oldPlayers++;
				}
			}
		}
	}

	c.log.info("gc summary", {
		expiredLobbyDestroyMeta: expiredLobbyDestroyMeta,
		unreadyLobbies: unreadyLobbies,
		emptyLobbies: emptyLobbies,
		unconnectedPlayers: unconnectedPlayers,
		oldPlayers: oldPlayers,
	});
}
