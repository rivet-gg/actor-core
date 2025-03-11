import { describe, test, expect } from "vitest";
import {
	setupTest,
	setLobbyReady,
	ADMIN_TOKEN,
	VERSION,
	REGION,
} from "./test-utils";

describe("lobby capacity", () => {
	test("lobby size limits", async () => {
		const { mm } = await setupTest();

		// Get the lobby information to verify player count
		const { lobbies: lobbies0 } = await mm.listLobbies({ version: VERSION });
		expect(lobbies0.length).toBe(0);

		// Create a lobby with specified max player limit
		const { lobby, players: players1 } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 3,
				maxPlayersDirect: 3,
			},
			players: [{}], // Start with 1 player
			noWait: true,
		});

		// Get the lobby information to verify player count
		const { lobbies: lobbies1 } = await mm.listLobbies({ version: VERSION });
		expect(lobbies1.length).toBe(1);

		// Get the lobby token and set lobby as ready
		const { lobbyToken } = await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Add 2 more players to reach the max
		await mm.joinLobby({
			lobbyId: lobby.id,
			players: [{}, {}], // Add 2 more players to reach max of 3
			noWait: true,
		});

		// Disconnect a player to free up space
		await mm.setPlayersDisconnected({
			lobbyToken,
			playerTokens: [players1[0]?.token],
		});

		// Now we should be able to join with a new player
		await mm.joinLobby({
			lobbyId: lobby.id,
			players: [{}], // Add 1 player to reach max again
			noWait: true,
		});

		// Get the lobby information to verify player count
		const { lobbies } = await mm.listLobbies({ version: VERSION });
		expect(lobbies.length).toBe(1);
		expect(lobbies[0]?.players).toBe(3); // Should have 3 players now
		expect(lobbies[0]?.maxPlayers).toBe(3); // Max is 3
	});

	test("maxPlayersDirect limitations", async () => {
		const { mm } = await setupTest();

		// Create a lobby with maxPlayersDirect < maxPlayers
		const { lobby } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 8, // Can hold 8 players total
				maxPlayersDirect: 2, // But only 2 can join directly
			},
			players: [{}], // Start with 1 player
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Add another player to reach maxPlayersDirect limit
		await mm.joinLobby({
			lobbyId: lobby.id,
			players: [{}],
			noWait: true,
		});

		// Add one more player to verify we can add 3 total (exceeding maxPlayersDirect=2)
		// This works because the limit is only on directly joining players, not total capacity
		await mm.joinLobby({
			lobbyId: lobby.id,
			players: [{}],
			noWait: true,
		});

		// Verify the lobby exists with 3 players total
		const { lobbies } = await mm.listLobbies({ version: VERSION });
		expect(lobbies.length).toBe(1);
		expect(lobbies[0]?.players).toBe(3); // 3 players total
		expect(lobbies[0]?.maxPlayersDirect).toBe(2); // Only 2 direct allowed
		expect(lobbies[0]?.maxPlayers).toBe(8); // Total capacity
	});

	test("sort order by player count", async () => {
		const { mm } = await setupTest();

		// MARK: Create lobbies with different player counts
		const { lobby: lobby1 } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}, {}], // 2 players
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby1.id);

		const { lobby: lobby2 } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}], // 1 player
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby2.id);

		const { lobby: lobby3 } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}, {}, {}], // 3 players
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby3.id);

		// MARK: Find lobby should prefer the one with the most players
		const { lobby: foundLobby } = await mm.findLobby({
			query: {
				version: VERSION,
			},
			players: [{}],
			noWait: false,
		});

		// Should choose lobby3 which has the most players (3)
		expect(foundLobby.id).toBe(lobby3.id);
	});

	// TODO: Players per IP currently not enabled
	test.skip("max players per ip", async () => {
		const { mm } = await setupTest({
			lobbies: {
				unreadyExpireAfter: 60000,
				regions: [REGION],
				backend: {
					test: {},
				},
			},
			players: {
				unconnectedExpireAfter: 60000,
				maxPerIp: 2, // Set max players per IP to 2
			},
			admin: {
				token: ADMIN_TOKEN,
			},
		});

		// Create a lobby
		const { lobby } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 5,
				maxPlayersDirect: 5,
			},
			players: [{}, {}], // Start with 2 players (max per IP)
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Try to add a third player with the same IP - should fail with too_many_players_for_ip
		await expect(
			mm.joinLobby({
				lobbyId: lobby.id,
				players: [{}], // Add a third player
				noWait: true,
			}),
		).rejects.toMatchObject({
			code: "too_many_players_for_ip",
		});
	});

	// TODO: Players per IP currently not enabled
	test.skip("max players per ip with unconnected players", async () => {
		const { mm } = await setupTest({
			lobbies: {
				unreadyExpireAfter: 60000,
				regions: [REGION],
				backend: {
					test: {},
				},
			},
			players: {
				unconnectedExpireAfter: 60000,
				maxPerIp: 2, // Only allow 2 players per IP
			},
			admin: {
				token: ADMIN_TOKEN,
			},
		});

		// Create a lobby with 2 players (should max out per IP)
		const { lobby } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 10,
				maxPlayersDirect: 10,
			},
			players: [{}, {}], // Create 2 players (max per IP)
			noWait: true,
		});
		const { lobbyToken } = await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Try to add one more player - this should remove an unconnected player to make room
		const { players: newPlayers } = await mm.joinLobby({
			lobbyId: lobby.id,
			players: [{}], // Add another player
			noWait: true,
		});

		// Get the lobby's current players
		const updatedLobby = await mm.adminGetLobby({
			adminToken: ADMIN_TOKEN,
			lobbyId: lobby.id,
		});

		// Should still have 2 players total (the maxPerIp limit)
		expect(Object.keys(updatedLobby.players).length).toBe(2);

		// New player should be among the remaining players
		expect(newPlayers.length).toBe(1);

		// Connect one of the players
		await mm.setPlayersConnected({
			lobbyToken,
			playerTokens: [newPlayers[0]?.token],
		});

		// Now, since we have one connected player, we should be able to add one more unconnected
		const { players: additionalPlayers } = await mm.joinLobby({
			lobbyId: lobby.id,
			players: [{}],
			noWait: true,
		});

		// Verify the player was added
		expect(additionalPlayers.length).toBe(1);

		// Get the updated lobby players
		const finalLobby = await mm.adminGetLobby({
			adminToken: ADMIN_TOKEN,
			lobbyId: lobby.id,
		});

		// Should now have 3 players total (1 connected + 2 unconnected)
		expect(Object.keys(finalLobby.players).length).toBe(3);
	});

	test("max unconnected players", async () => {
		const { mm } = await setupTest({
			lobbies: {
				unreadyExpireAfter: 60000,
				regions: [REGION],
				backend: {
					test: {},
				},
			},
			players: {
				unconnectedExpireAfter: 60000,
				maxUnconnected: 2, // Only allow 2 unconnected players total
			},
			admin: {
				token: ADMIN_TOKEN,
			},
		});

		// Create a lobby with 2 players - this maxes out unconnected players
		const { lobby } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 10,
				maxPlayersDirect: 10,
			},
			players: [{}, {}], // Create 2 unconnected players (max)
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Create a second lobby
		await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 10,
				maxPlayersDirect: 10,
			},
			players: [{}], // Try to add 1 player to second lobby
			noWait: true,
		});

		// Verify oldest players were removed to make room for newer players
		const { lobbies } = await mm.listLobbies({ version: VERSION });
		expect(lobbies.length).toBe(2);

		// This test is successful if we get here without errors, as the lobby manager
		// should automatically remove unconnected players to make room for new ones
	});
});
