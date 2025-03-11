import { describe, test, expect } from "vitest";
import {
	setupTest,
	setLobbyReady,
	ADMIN_TOKEN,
	VERSION,
	REGION,
} from "./test-utils";

describe("lobby tags", () => {
	test("lobby tags and finding", async () => {
		const { mm } = await setupTest();

		// MARK: Create lobbies
		const { lobby: lobby1 } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: { gameMode: "a" },
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}],
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby1.id);

		const { lobby: lobby2 } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: { gameMode: "a" },
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}],
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby2.id);

		const { lobby: lobby3 } = await mm.createLobby({
			lobby: {
				version: VERSION,
				region: REGION,
				tags: { gameMode: "b" },
				maxPlayers: 8,
				maxPlayersDirect: 8,
			},
			players: [{}],
			noWait: true,
		});
		await setLobbyReady(mm, ADMIN_TOKEN, lobby3.id);

		// MARK: Find lobbies
		const { lobby: lobby4 } = await mm.findLobby({
			query: {
				version: VERSION,
				tags: { gameMode: "a" },
			},
			players: [{}],
			noWait: false,
		});
		expect(lobby4.id).toBeOneOf([lobby1.id, lobby2.id]);

		const { lobby: lobby5 } = await mm.findLobby({
			query: {
				version: VERSION,
				tags: { gameMode: "b" },
			},
			players: [{}],
			noWait: false,
		});
		expect(lobby5.id).toBe(lobby3.id);

		const { lobby: lobby6 } = await mm.findLobby({
			query: {
				version: VERSION,
				regions: [REGION],
				tags: { gameMode: "a" },
			},
			players: [{}],
			noWait: false,
		});
		expect(lobby6.id).toBe(lobby4.id);
	});
});
