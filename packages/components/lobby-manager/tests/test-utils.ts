import { onTestFinished, vi } from "vitest";
import { type ActorHandle, Client, createClient } from "actor-core/client";
import getPort from "get-port";
import { lobbyManager } from "../src/mod";
import { serve } from "@actor-core/nodejs";
import { ActorCoreApp, setup } from "actor-core";

export const ADMIN_TOKEN = "test-admin";
export const VERSION = "test";
export const REGION = "test";

type App = ActorCoreApp<{ lobbyManager: ReturnType<typeof lobbyManager> }>;

export interface SetupTestResult {
	mm: ActorHandle<ReturnType<typeof lobbyManager>>;
	client: Client<App>;
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

	// Setup app
	const app: App = setup({
		actors: { lobbyManager: lobbyManager(config ?? defaultConfig) },
	});

	// Start server with a random port
	const port = await getPort();
	const server = serve(app, { port });
	onTestFinished(
		async () => await new Promise((resolve) => server.close(() => resolve())),
	);

	// Create client
	const client = createClient<App>(`http://localhost:${port}`);
	onTestFinished(async () => await client.dispose());

	const mm = await client.lobbyManager.get();

	return {
		mm,
		client,
	};
}

export async function getLobbyToken(
	mm: ActorHandle<ReturnType<typeof lobbyManager>>,
	adminToken: string,
	lobbyId: string,
): Promise<string> {
	const lobby = await mm.adminGetLobby({ adminToken, lobbyId });
	return lobby.token;
}

export async function setLobbyReady(
	mm: ActorHandle<ReturnType<typeof lobbyManager>>,
	adminToken: string,
	lobbyId: string,
): Promise<{ lobbyToken: string }> {
	const lobbyToken = await getLobbyToken(mm, adminToken, lobbyId);
	await mm.setLobbyReady({ lobbyToken });
	return { lobbyToken };
}
