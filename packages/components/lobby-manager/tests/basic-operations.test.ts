import { describe, test, expect} from "vitest";
import {
	setupTest,
	setLobbyReady,
	ADMIN_TOKEN,
	VERSION,
	REGION,
} from "./test-utils";

describe("basic operations", () => {
	test("basic lobby lifecycle", async () => {
		const { mm } = await setupTest();

		// MARK: Create lobby
		const { lobby, players } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: {},
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}, {}],
			noWait: true,
		});
		const { lobbyToken } = await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// MARK: List lobbies
		{
			const { lobbies } = await mm.listLobbies({
				version: VERSION,
			});
			expect(lobbies.length).toBe(1);
			expect(lobbies[0]?.id).toBe(lobby.id);
		}

		// MARK: Connect players
		await mm.setPlayersConnected({
			lobbyToken,
			playerTokens: [players[0]?.token, players[1]?.token],
		});

		// MARK: Disconnect players
		await mm.setPlayersDisconnected({
			lobbyToken,
			playerTokens: [players[0]?.token, players[1]?.token],
		});

		// MARK: Create players
		{
			const { players: players2 } = await mm.joinLobby({
				lobbyId: lobby.id,
				players: [{}],
				noWait: true,
			});
			await mm.setPlayersConnected({
				lobbyToken,
				playerTokens: [players2[0]?.token],
			});
			await mm.setPlayersDisconnected({
				lobbyToken,
				playerTokens: [players2[0]?.token],
			});
		}

		// MARK: Destroy lobby
		await mm.adminDestroyLobby({
			adminToken: ADMIN_TOKEN,
			lobbyId: lobby.id,
		});

		{
			const { lobbies } = await mm.listLobbies({
				version: VERSION,
			});
			expect(lobbies.length).toBe(0);
		}

		await expect(
			mm.adminDestroyLobby({ adminToken: ADMIN_TOKEN, lobbyId: lobby.id }),
		).rejects.toMatchObject({ code: "lobby_not_found" });
	});

	test("findLobby with no matching lobbies", async () => {
		const { mm } = await setupTest();

		// Create a lobby with specific tags
		const { lobby } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: { gameMode: "capture-the-flag" },
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}],
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby.id);

		// Try to find a lobby with non-matching tags
		await expect(
			mm.findLobby({
				query: {
					version: VERSION,
					tags: { gameMode: "deathmatch" }, // Different from what we created
				},
				players: [{}],
				noWait: true, // Important: don't wait for match
			}),
		).rejects.toMatchObject({
			code: "no_matching_lobbies",
		});
	});
});
