import { onTestFinished, vi } from "vitest";
import { type ActorHandle, Client } from "actor-core/client";
import getPort from "get-port";
import { type LobbyManager, lobbyManager } from "../src/mod";
import { serve } from "@actor-core/nodejs";

export const ADMIN_TOKEN = "test-admin";
export const VERSION = "test";
export const REGION = "test";

export interface SetupTestResult {
	mm: ActorHandle<LobbyManager>;
	client: Client;
}

export async function setupTest(
	config?: Parameters<typeof lobbyManager>[0],
): Promise<SetupTestResult> {
	vi.useFakeTimers();

	const defaultConfig = {
		lobbies: {
			unreadyExpireAfter: 60000,
			regions: [REGION],
			backend: {
				test: {},
			},
		},
		players: {
			unconnectedExpireAfter: 60000,
		},
		admin: {
			token: ADMIN_TOKEN,
		},
	};

	// Start server with a random port
	const port = await getPort();
	const server = serve({
		actors: {
			"lobby-manager": lobbyManager(config ?? defaultConfig),
		},
		port,
	});
	onTestFinished(
		async () => await new Promise((resolve) => server.close(() => resolve())),
	);

	// Create client
	const client = new Client(`http://localhost:${port}`);
	onTestFinished(async () => await client.dispose());

	// Get actor reference
	const mm = await client.get<LobbyManager>({ name: "lobby-manager" });

	return {
		mm,
		client,
	};
}

export async function getLobbyToken(
	mm: ActorHandle<LobbyManager>,
	adminToken: string,
	lobbyId: string,
): Promise<string> {
	const lobby = await mm.adminGetLobby({ adminToken, lobbyId });
	return lobby.token;
}

export async function setLobbyReady(
	mm: ActorHandle<LobbyManager>,
	adminToken: string,
	lobbyId: string,
): Promise<{ lobbyToken: string }> {
	const lobbyToken = await getLobbyToken(mm, adminToken, lobbyId);
	await mm.setLobbyReady({ lobbyToken });
	return { lobbyToken };
}
