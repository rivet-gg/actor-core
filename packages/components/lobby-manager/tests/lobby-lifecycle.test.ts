import { describe, test, expect, vi } from "vitest";
import {
	setupTest,
	setLobbyReady,
	ADMIN_TOKEN,
	VERSION,
	REGION,
} from "./test-utils";

describe("lobby lifecycle", () => {
	test("lobby unready expire", async () => {
		const unreadyExpireAfter = 200; // For quick test
		const { mm } = await setupTest({
			tickInterval: 50, // Speed up tick interval for test
			gcInterval: 50,
			lobbies: {
				unreadyExpireAfter,
				regions: [REGION],
				backend: {
					test: {},
				},
			},
			players: {},
			admin: {
				token: ADMIN_TOKEN,
			},
		});

		// Create a lobby but DON'T mark it as ready
		const { lobby } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 5,
				maxPlayersDirect: 5,
			},
			players: [{}],
			noWait: true, // Important: don't wait for ready
		});

		// Verify lobby exists
		const { lobbies: initialLobbies } = await mm.listLobbies({
			version: VERSION,
		});
		expect(initialLobbies.length).toBe(1);
		expect(initialLobbies[0]?.id).toBe(lobby.id);

		// Wait longer than the unready expiration time
		await vi.advanceTimersByTimeAsync(unreadyExpireAfter + 100);

		// The lobby should be removed by the GC
		const { lobbies: finalLobbies } = await mm.listLobbies({
			version: VERSION,
		});
		expect(finalLobbies.length).toBe(0);
	});

	test("empty lobby expire", async () => {
		const { mm } = await setupTest({
			lobbies: {
				unreadyExpireAfter: 60000,
				regions: [REGION],
				backend: {
					test: {},
				},
				destroyOnEmptyAfter: 0, // Destroy immediately when empty
			},
			players: {
				unconnectedExpireAfter: 60000,
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

		// Verify lobby exists
		const { lobbies: initialLobbies } = await mm.listLobbies({
			version: VERSION,
		});
		expect(initialLobbies.length).toBe(1);

		// Disconnect the player, making the lobby empty
		await mm.setPlayersDisconnected({
			lobbyToken,
			playerTokens: [players[0]?.token],
		});

		// Lobby should be destroyed immediately
		const { lobbies: finalLobbies } = await mm.listLobbies({
			version: VERSION,
		});
		expect(finalLobbies.length).toBe(0);
	});
});
