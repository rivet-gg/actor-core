import { describe, test, expect, vi } from "vitest";
import {
	setupTest,
	setLobbyReady,
	ADMIN_TOKEN,
	VERSION,
	REGION,
} from "./test-utils";

describe("player lifecycle", () => {
	test("player unconnected expire", async () => {
		const unconnectedExpireAfter = 200;
		const { mm } = await setupTest({
			tickInterval: 50, // Speed up tick interval for test
			gcInterval: 50,
			lobbies: {
				regions: [REGION],
				backend: {
					test: {},
				},
			},
			players: {
				unconnectedExpireAfter,
			},
			admin: {
				token: ADMIN_TOKEN,
			},
		});

		// Create a lobby with a player
		const { lobby } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 5,
				maxPlayersDirect: 5,
			},
			players: [{}], // Create 1 player that will expire
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Get initial lobby state
		const initialLobby = await mm.adminGetLobby({
			adminToken: ADMIN_TOKEN,
			lobbyId: lobby.id,
		});

		// Verify player exists in the lobby
		const initialPlayerCount = Object.keys(initialLobby.players).length;
		expect(initialPlayerCount).toBe(1);

		// Wait for more than the unconnected player expiration time
		await vi.advanceTimersByTimeAsync(unconnectedExpireAfter + 100);

		// Get lobby after waiting, player should have been removed by GC
		const finalLobby = await mm.adminGetLobby({
			adminToken: ADMIN_TOKEN,
			lobbyId: lobby.id,
		});

		// Lobby should have fewer players now
		const finalPlayerCount = Object.keys(finalLobby.players).length;
		expect(finalPlayerCount).toBe(0);
	});

	test("old player expire", async () => {
		const autoDestroyAfter = 200;
		const { mm } = await setupTest({
			tickInterval: 50, // Speed up tick interval for test
			gcInterval: 50,
			lobbies: {
				regions: [REGION],
				backend: {
					test: {},
				},
			},
			players: {
				autoDestroyAfter,
			},
			admin: {
				token: ADMIN_TOKEN,
			},
		});

		// Create a lobby with a player
		const { lobby, players } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 5,
				maxPlayersDirect: 5,
			},
			players: [{}],
			noWait: true,
		});
		const { lobbyToken } = await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Connect the player
		await mm.setPlayersConnected({
			lobbyToken,
			playerTokens: [players[0]?.token],
		});

		// Get initial lobby state
		const initialLobby = await mm.adminGetLobby({
			adminToken: ADMIN_TOKEN,
			lobbyId: lobby.id,
		});
		expect(Object.keys(initialLobby.players).length).toBe(1);

		// Wait longer than the auto-destroy time
		await vi.advanceTimersByTimeAsync(autoDestroyAfter + 100);

		// Get final lobby state - the player should be auto-destroyed
		const finalLobby = await mm.adminGetLobby({
			adminToken: ADMIN_TOKEN,
			lobbyId: lobby.id,
		});
		expect(Object.keys(finalLobby.players).length).toBe(0);
	});
});
