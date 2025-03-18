//	export async function _tick() {
//		this._schedule.after(config.tickInterval, "_tick");
//
//		const now = Date.now();
//		if (now - this.#currentState.lastGcAt >= config.gcInterval) {
//			this.#currentState.lastGcAt = now;
//			this.#gc();
//		}
//		if (
//			now - this.#currentState.lastServerPollAt >=
//			config.pollServersInterval
//		) {
//			this.#currentState.lastServerPollAt = now;
//			await this.#pollServers();
//		}
//	}
//
//export async function gc(c: LobbyManagerContext,) {
//		// GC destroy meta
//		let expiredLobbyDestroyMeta = 0;
//		for (const [lobbyId, meta] of Object.entries(this.#lobbyDestroyMeta)) {
//			if (Date.now() - meta.destroyedAt > 180_000) {
//				expiredLobbyDestroyMeta++;
//				delete this.#lobbyDestroyMeta[lobbyId];
//			}
//		}
//
//		// GC lobbies
//		let unreadyLobbies = 0;
//		let emptyLobbies = 0;
//		let unconnectedPlayers = 0;
//		let oldPlayers = 0;
//		for (const lobby of Object.values(this.#lobbies)) {
//			const lobbyConfig = getLobbyConfig(config, lobby.tags);
//
//			// Destroy lobby if unready
//			if (
//				canMutateLobbies(lobbyConfig) &&
//				lobby.readyAt === undefined &&
//				Date.now() - lobby.createdAt > config.lobbies.unreadyExpireAfter
//			) {
//				this._log.warn("destroying unready lobby", {
//					lobbyId: lobby.id,
//					unreadyExpireAfter: config.lobbies.unreadyExpireAfter,
//				});
//				this.#destroyLobby({
//					lobbyId: lobby.id,
//					reason: "lobby_ready_timeout",
//				});
//				unreadyLobbies++;
//				continue;
//			}
//
//			// Destroy lobby if empty for long enough
//			if (
//				canMutateLobbies(lobbyConfig) &&
//				lobbyConfig.destroyOnEmptyAfter !== null &&
//				lobby.emptyAt !== undefined &&
//				Date.now() - lobby.emptyAt > lobbyConfig.destroyOnEmptyAfter
//			) {
//				this._log.debug("destroying empty lobby", {
//					lobbyId: lobby.id,
//					unreadyExpireAfter: config.lobbies.unreadyExpireAfter,
//				});
//				this.#destroyLobby({ lobbyId: lobby.id, reason: "lobby_empty" });
//				emptyLobbies++;
//				continue;
//			}
//
//			if (lobby.readyAt !== undefined) {
//				for (const player of Object.values(lobby.players)) {
//					// If joining a preemptively created lobby, the player's
//					// created timestamp will be earlier than when the lobby
//					// actually becomes able to be connected to.
//					//
//					// GC players based on the timestamp the lobby started if
//					// needed.
//					const startAt = Math.max(player.createdAt, lobby.readyAt);
//
//					// Clean up unconnected players
//					if (
//						player.connectedAt === undefined &&
//						Date.now() - startAt > config.players.unconnectedExpireAfter
//					) {
//						this._log.debug("destroying unconnected player", {
//							playerId: player.id,
//
//							unconnectedExpireAfter:
//								config.players.unconnectedExpireAfter,
//						});
//						this.#destroyPlayers(player.lobbyId, true, [player.id]);
//						unconnectedPlayers++;
//						continue;
//					}
//
//					// Clean up really old players
//					if (
//						config.players.autoDestroyAfter !== undefined &&
//						Date.now() - startAt > config.players.autoDestroyAfter
//					) {
//						this._log.warn("destroying old player", {
//							playerId: player.id,
//							autoDestroyAfter: config.players.autoDestroyAfter,
//						});
//						this.#destroyPlayers(player.lobbyId, true, [player.id]);
//						oldPlayers++;
//					}
//				}
//			}
//		}
//
//		this._log.info("gc summary", {
//			expiredLobbyDestroyMeta: expiredLobbyDestroyMeta,
//			unreadyLobbies: unreadyLobbies,
//			emptyLobbies: emptyLobbies,
//			unconnectedPlayers: unconnectedPlayers,
//			oldPlayers: oldPlayers,
//		});
//	}
