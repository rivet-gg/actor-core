import { actor, ActorContextOf, ActorDefinition } from "actor-core";
import { type InputConfig, ConfigSchema, type Config } from "@/config";
import { createNanoEvents, type Emitter } from "nanoevents";
import * as RpcSchema from "@/utils/lobby_manager/rpc";
import { parseRequest } from "@/utils/lobby_manager/rpc";
import type * as State from "@/utils/lobby_manager/state/mod";
import { generateToken } from "@/utils/token";
import { validateAdminToken } from "@/actor/admin";
import {
	buildLobbyResponse,
	createLobby,
	destroyLobby,
	findLobby,
	findOrCreateLobby,
	getLobby,
	playerForTokens,
	resolveLobbyFromRequest,
	setLobbyReady,
	waitForLobbyReady,
} from "@/actor/lobby";
import {
	buildPlayersResponse,
	createPlayers,
	destroyPlayers,
	setPlayersConnected,
} from "./player";
import { currentState } from "./state";

export const LOCAL_LOBBY_ID = "00000000-0000-0000-0000-000000000000";

export const EVENT_KEYS = {
	lobbyUpdate(lobbyId: string): string {
		return `lobby.ready.${lobbyId}`;
	},
};

interface ConnState {
	remoteAddress?: string;
}

interface Vars {
	emitter: Emitter;
	config: Config;
}

export type LobbyManagerContext = ActorContextOf<
	ReturnType<typeof lobbyManager>
>;

export function lobbyManager(inputConfig: InputConfig) {
	const config = ConfigSchema.parse(inputConfig);

	return actor<
		State.StateVersioned,
		undefined,
		ConnState,
		Vars,
		Record<never, never>
	>({
		createVars: () => ({
			emitter: createNanoEvents(),
			config,
		}),
		createState: (): State.StateVersioned => {
			// TODO: This doesn't handle lobbyRules correctly
			// Create default lobbies if needed
			const lobbies: Record<string, State.Lobby> = {};
			if ("localDevelopment" in config.lobbies.backend) {
				const devConfig = config.lobbies.backend.localDevelopment;
				const localLobbyId = LOCAL_LOBBY_ID;

				const ports: Record<string, State.LobbyBackendLocalDevelopmentPort> =
					{};
				for (const [portName, port] of Object.entries(devConfig.ports)) {
					ports[portName] = {
						protocol: port.protocol,
						hostname: port.hostname ?? "127.0.0.1",
						port: port.port,
					};
				}

				lobbies[localLobbyId] = {
					id: localLobbyId,
					token: generateToken("lobby"),
					version: devConfig.version ?? "default",
					region: "local",
					tags: devConfig.tags ?? {},
					createdAt: Date.now(),
					readyAt: Date.now(),
					emptyAt: Date.now(),
					players: {},
					maxPlayers: devConfig.maxPlayers ?? 32,
					maxPlayersDirect: devConfig.maxPlayersDirect ?? 32,
					backend: {
						localDevelopment: { ports },
					},
				};
			}

			return {
				version: 1,
				state: {
					lobbies,
					servers: {},
					lastGcAt: 0,
					lastServerPollAt: 0,
					lobbyDestroyMeta: {},
				},
			};
		},
		onCreate: (c) => {
			// TODO: Make this private
			c.schedule.after(config.tickInterval, "tick");
		},
		actions: {
			createLobby: async (
				ac,
				reqInput: RpcSchema.CreateLobbyRequestInput,
			): Promise<RpcSchema.CreateLobbyResponse> => {
				const req = parseRequest(RpcSchema.CreateLobbyRequestSchema, reqInput);

				const { lobbyId, playerIds } = createLobby(c, {
					remoteAddress: ac.conn.state.remoteAddress,
					...req,
				});
				if (!req.noWait) await waitForLobbyReady(c, lobbyId);
				return {
					lobby: buildLobbyResponse(c, lobbyId),
					players: buildPlayersResponse(c, lobbyId, playerIds),
				};
			},
			findLobby: async (
				ac,
				reqInput: RpcSchema.FindLobbyRequestInput,
			): Promise<RpcSchema.FindLobbyResponse> => {
				const req = parseRequest(RpcSchema.FindLobbyRequestSchema, reqInput);

				const { lobbyId, playerIds } = findLobby(c, {
					remoteAddress: ac.conn.state.remoteAddress,
					...req,
				});
				if (!req.noWait) await waitForLobbyReady(c, lobbyId);
				return {
					lobby: buildLobbyResponse(c, lobbyId),
					players: buildPlayersResponse(c, lobbyId, playerIds),
				};
			},

			findOrCreateLobby: async (
				ac,
				reqInput: RpcSchema.FindOrCreateLobbyRequestInput,
			): Promise<RpcSchema.FindOrCreateLobbyResponse> => {
				const req = parseRequest(
					RpcSchema.FindOrCreateLobbyRequestSchema,
					reqInput,
				);

				const { lobbyId, playerIds } = findOrCreateLobby(c, {
					...req,
					remoteAddress: ac.conn.state.remoteAddress,
				});
				if (!req.noWait) await waitForLobbyReady(c, lobbyId);
				return {
					lobby: buildLobbyResponse(c, lobbyId),
					players: buildPlayersResponse(c, lobbyId, playerIds),
				};
			},

			joinLobby: async (
				ac,
				reqInput: RpcSchema.JoinLobbyRequestInput,
			): Promise<RpcSchema.JoinLobbyResponse> => {
				const req = parseRequest(RpcSchema.JoinLobbyRequestSchema, reqInput);

				const { playerIds } = createPlayers(c, {
					lobbyId: req.lobbyId,
					players: req.players,
					remoteAddress: ac.conn.state.remoteAddress,
				});
				if (!req.noWait) await waitForLobbyReady(c, req.lobbyId);
				return {
					lobby: buildLobbyResponse(c, req.lobbyId),
					players: buildPlayersResponse(c, req.lobbyId, playerIds),
				};
			},

			setLobbyReady: (_ac, reqInput: RpcSchema.SetLobbyReadyRequestInput) => {
				const req = parseRequest(
					RpcSchema.SetLobbyReadyRequestSchema,
					reqInput,
				);
				setLobbyReady(c, req);
			},

			setPlayersDisconnected: (
				_ac,
				reqInput: RpcSchema.SetPlayersDisconnectedInput,
			) => {
				const req = parseRequest(
					RpcSchema.SetPlayersDisconnectedSchema,
					reqInput,
				);

				const { lobbyId, hasLobbyToken } = resolveLobbyFromRequest(c, req);
				const playerIds = playerForTokens(c, lobbyId, req.playerTokens);
				destroyPlayers(c, lobbyId, hasLobbyToken, playerIds);
			},

			setPlayersConnected: (
				_ac,
				reqInput: RpcSchema.SetPlayersConnectedRequestInput,
			) => {
				const req = parseRequest(
					RpcSchema.SetPlayersConnectedRequestSchema,
					reqInput,
				);

				const { lobbyId, hasLobbyToken } = resolveLobbyFromRequest(c, req);
				const playerIds = playerForTokens(c, lobbyId, req.playerTokens);
				setPlayersConnected(c, lobbyId, hasLobbyToken, playerIds);
			},

			listLobbies: (
				ac,
				reqInput: RpcSchema.ListLobbiesRequestInput,
			): RpcSchema.ListLobbiesResponse => {
				parseRequest(RpcSchema.ListLobbiesRequestSchema, reqInput);

				return {
					lobbies: Object.keys(currentState(c).lobbies).map((x) =>
						buildLobbyResponse(c, x),
					),
				};
			},

			// MARK: Admin
			adminDestroyLobby: async (
				_ac,
				reqInput: RpcSchema.AdminDestroyLobbyRequestInput,
			): Promise<void> => {
				const req = parseRequest(
					RpcSchema.AdminDestroyLobbyRequestSchema,
					reqInput,
				);

				validateAdminToken(c, req.adminToken);
				destroyLobby(c, {
					lobbyId: req.lobbyId,
					reason: req.reason,
				});
			},

			adminGetLobby: async (
				_ac,
				reqInput: RpcSchema.AdminGetLobbyTokenInput,
			): Promise<State.Lobby> => {
				const req = parseRequest(RpcSchema.AdminGetLobbyTokenSchema, reqInput);

				validateAdminToken(c, req.adminToken);
				const lobby = getLobby(c, req.lobbyId);
				return lobby;
			},
		},
	});
}
