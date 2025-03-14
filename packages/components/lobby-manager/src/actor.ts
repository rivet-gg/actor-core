import { Actor, type OnBeforeConnectOptions, type Rpc } from "actor-core";
import { assertUnreachable } from "actor-core/utils";
import invariant from "invariant";
import { createNanoEvents } from "nanoevents";
import type { Config, LobbyConfig } from "./config";
import {
	type LobbyBackendResponse,
	type LobbyResponse,
	lobbyTagsMatch,
} from "./utils/lobby/mod";
import {
	acceptAnyRegion,
	acceptAnyVersion,
	canCallLobbyReadyMultipleTimes,
	canMutateLobbies,
	getLobbyConfig,
	requiresLobbyToken,
} from "./utils/lobby_config";
import * as RpcSchema from "./utils/lobby_manager/rpc";
import { parseRequest } from "./utils/lobby_manager/rpc";
import type * as State from "./utils/lobby_manager/state/mod";
import type { PlayerResponseWithToken } from "./utils/player";
import { regionsForBackend } from "./utils/region";
import {
	CannotMutateLobbiesError,
	ForbiddenError,
	LobbyAbortedError,
	LobbyAlreadyReadyError,
	LobbyCreateMissingPlayersError,
	LobbyFullError,
	LobbyNotFoundError,
	LobbyTokenInvalidError,
	LobbyTokenRequiredError,
	MorePlayersThanMaxError,
	NoMatchingLobbiesError,
	PlayerAlreadyConnectedError,
	PlayerDisconnectedError,
	PlayerTokenInvalidError,
	RegionNotFoundError,
	TooManyPlayersForIpError,
} from "./errors";
import { ActorError } from "actor-core/errors";
import { generateToken } from "./utils/token";
import type { Rivet } from "@rivet-gg/api";
import { createRivetClient } from "./utils/lobby/backend/rivet";
import { hostname } from "os";

const MANAGER_SERVER_TAG = "manager";
const MANAGER_SERVER_TAG_VALUE = "opengb/lobbies";

//const VERSION_BUILD_TAG = "version";
//const ENABLED_BUILD_TAG = "enabled";
const CURRENT_BUILD_TAG = "current";
const TEMP_GAME_BUILD_TAG_VALUE = "game";

const LOCAL_LOBBY_ID = "00000000-0000-0000-0000-000000000000";

const EVENT_KEYS = {
	lobbyUpdate(lobbyId: string): string {
		return `lobby.ready.${lobbyId}`;
	},
};

// TODO: Document why we make everything sync in this actor and use background jobs

interface ConnState {
	remoteAddress?: string;
}

export class LobbyManager extends Actor<
	State.StateVersioned,
	undefined,
	ConnState
> {
	#config: Config;
	#emitter = createNanoEvents();

	/**
	 * Reasons that the lobbies were destroyed.
	 *
	 * Used to enhance lobby aborted errors.
	 *
	 * This is stored in-memory instead of in the state since it needs to be
	 * able to store raw `ActorError` objects.
	 */
	#lobbyDestroyMeta: Record<string, LobbyDestroyMeta> = {};

	/** State for the current version. */
	get #currentState(): State.State {
		return this._state.state;
	}

	get #lobbies(): Record<string, State.Lobby> {
		return this._state.state.lobbies;
	}

	get #servers(): Record<string, State.Server> {
		return this._state.state.servers;
	}

	constructor(config: Config) {
		super();
		this.#config = config;
	}

	_onBeforeConnect(_opts: OnBeforeConnectOptions<LobbyManager>): ConnState {
		// TODO: Remote address is currently not implemented
		return {};
	}

	_onInitialize(): State.StateVersioned {
		this._schedule.after(this.#config.tickInterval, "_tick");

		// TODO: This doesn't handle lobbyRules correctly
		// Create default lobbies if needed
		const lobbies: Record<string, State.Lobby> = {};
		if ("localDevelopment" in this.#config.lobbies.backend) {
			const devConfig = this.#config.lobbies.backend.localDevelopment;
			const localLobbyId = LOCAL_LOBBY_ID;

			const ports: Record<string, State.LobbyBackendLocalDevelopmentPort> = {};
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
			},
		};
	}

	// MARK: RPC
	public async createLobby(
		rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.CreateLobbyRequestInput,
	): Promise<RpcSchema.CreateLobbyResponse> {
		const req = parseRequest(RpcSchema.CreateLobbyRequestSchema, reqInput);

		const { lobbyId, playerIds } = this.#createLobby({
			remoteAddress: rpc.connection.state.remoteAddress,
			...req,
		});
		if (!req.noWait) await this.#waitForLobbyReady(lobbyId);
		return {
			lobby: this.#buildLobbyResponse(lobbyId),
			players: this.#buildPlayersResponse(lobbyId, playerIds),
		};
	}

	public async findLobby(
		rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.FindLobbyRequestInput,
	): Promise<RpcSchema.FindLobbyResponse> {
		const req = parseRequest(RpcSchema.FindLobbyRequestSchema, reqInput);

		const { lobbyId, playerIds } = this.#findLobby({
			remoteAddress: rpc.connection.state.remoteAddress,
			...req,
		});
		if (!req.noWait) await this.#waitForLobbyReady(lobbyId);
		return {
			lobby: this.#buildLobbyResponse(lobbyId),
			players: this.#buildPlayersResponse(lobbyId, playerIds),
		};
	}

	public async findOrCreateLobby(
		rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.FindOrCreateLobbyRequestInput,
	): Promise<RpcSchema.FindOrCreateLobbyResponse> {
		const req = parseRequest(
			RpcSchema.FindOrCreateLobbyRequestSchema,
			reqInput,
		);

		const { lobbyId, playerIds } = this.#findOrCreateLobby({
			...req,
			remoteAddress: rpc.connection.state.remoteAddress,
		});
		if (!req.noWait) await this.#waitForLobbyReady(lobbyId);
		return {
			lobby: this.#buildLobbyResponse(lobbyId),
			players: this.#buildPlayersResponse(lobbyId, playerIds),
		};
	}

	public async joinLobby(
		rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.JoinLobbyRequestInput,
	): Promise<RpcSchema.JoinLobbyResponse> {
		const req = parseRequest(RpcSchema.JoinLobbyRequestSchema, reqInput);

		const { playerIds } = this.#createPlayers({
			lobbyId: req.lobbyId,
			players: req.players,
			remoteAddress: rpc.connection.state.remoteAddress,
		});
		if (!req.noWait) await this.#waitForLobbyReady(req.lobbyId);
		return {
			lobby: this.#buildLobbyResponse(req.lobbyId),
			players: this.#buildPlayersResponse(req.lobbyId, playerIds),
		};
	}

	public setLobbyReady(
		_rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.SetLobbyReadyRequestInput,
	) {
		const req = parseRequest(RpcSchema.SetLobbyReadyRequestSchema, reqInput);
		this.#setLobbyReady(req);
	}

	public setPlayersDisconnected(
		_rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.SetPlayersDisconnectedInput,
	) {
		const req = parseRequest(RpcSchema.SetPlayersDisconnectedSchema, reqInput);

		const { lobbyId, hasLobbyToken } = this.#resolveLobbyFromRequest(req);
		const playerIds = this.#playerForTokens(lobbyId, req.playerTokens);
		this.#destroyPlayers(lobbyId, hasLobbyToken, playerIds);
	}

	public setPlayersConnected(
		_rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.SetPlayersConnectedRequestInput,
	) {
		const req = parseRequest(
			RpcSchema.SetPlayersConnectedRequestSchema,
			reqInput,
		);

		const { lobbyId, hasLobbyToken } = this.#resolveLobbyFromRequest(req);
		const playerIds = this.#playerForTokens(lobbyId, req.playerTokens);
		this.#setPlayersConnected(lobbyId, hasLobbyToken, playerIds);
	}

	public listLobbies(
		_rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.ListLobbiesRequestInput,
	): RpcSchema.ListLobbiesResponse {
		parseRequest(RpcSchema.ListLobbiesRequestSchema, reqInput);

		return {
			lobbies: Object.keys(this.#lobbies).map((x) =>
				this.#buildLobbyResponse(x),
			),
		};
	}

	// MARK: Admin
	public async adminDestroyLobby(
		_rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.AdminDestroyLobbyRequestInput,
	): Promise<void> {
		const req = parseRequest(
			RpcSchema.AdminDestroyLobbyRequestSchema,
			reqInput,
		);

		this.#validateAdminToken(req.adminToken);
		this.#destroyLobby({
			lobbyId: req.lobbyId,
			reason: req.reason,
		});
	}

	public async adminGetLobby(
		_rpc: Rpc<LobbyManager>,
		reqInput: RpcSchema.AdminGetLobbyTokenInput,
	): Promise<State.Lobby> {
		const req = parseRequest(RpcSchema.AdminGetLobbyTokenSchema, reqInput);

		this.#validateAdminToken(req.adminToken);
		const lobby = this.#getLobby(req.lobbyId);
		return lobby;
	}

	#validateAdminToken(token: string) {
		if (!this.#config.admin || this.#config.admin.token !== token)
			throw new ForbiddenError();
	}

	// MARK: Lobby
	#createLobby(req: {
		lobby: RpcSchema.LobbyRequest;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	}): {
		lobbyId: string;
		playerIds: string[];
	} {
		const lobbyConfig = getLobbyConfig(this.#config, req.lobby.tags ?? {});

		// Check lobby can be created
		if (!canMutateLobbies(lobbyConfig)) {
			throw new CannotMutateLobbiesError();
		}

		if (req.players.length > req.lobby.maxPlayers) {
			throw new MorePlayersThanMaxError();
		}

		if (
			lobbyConfig.destroyOnEmptyAfter !== null &&
			(!req.players.length || req.players.length === 0)
		) {
			throw new LobbyCreateMissingPlayersError();
		}

		// Valiadte region
		const validRegions = regionsForBackend(lobbyConfig.backend);
		if (validRegions.findIndex((x) => x.slug === req.lobby.region) === -1) {
			throw new RegionNotFoundError({
				region: req.lobby.region,
			});
		}

		// Create backend
		let backend: State.LobbyBackend;
		if ("test" in lobbyConfig.backend) {
			backend = { test: {} };
		} else if ("localDevelopment" in lobbyConfig.backend) {
			assertUnreachable(undefined as never);
		} else if ("rivet" in lobbyConfig.backend) {
			// Create backend
			const serverId = crypto.randomUUID();
			backend = {
				rivet: { serverId },
			};

			// Add server
			const server: State.Server = { id: serverId, createdAt: Date.now() };
			this.#servers[server.id] = server;
		} else {
			assertUnreachable(lobbyConfig.backend);
		}

		// Create lobby
		const lobby: State.Lobby = {
			id: crypto.randomUUID(),
			token: generateToken("lobby"),
			version: req.lobby.version,
			region: req.lobby.region,
			tags: req.lobby.tags ?? {},
			createdAt: Date.now(),
			emptyAt: Date.now(),
			players: {},
			maxPlayers: req.lobby.maxPlayers,
			maxPlayersDirect: req.lobby.maxPlayersDirect,
			backend,
		};
		this.#lobbies[lobby.id] = lobby;

		// Create players
		const { playerIds } = this.#createPlayers({
			lobbyId: lobby.id,
			players: req.players,
			remoteAddress: req.remoteAddress,
		});

		// Run background job
		//
		// This is because both requests finding & joining this lobby need to
		// wait for the background job to finish before returning.
		if ("rivet" in backend) {
			this._runInBackground(
				this.#createServerBackground(
					lobby,
					lobbyConfig,
					backend.rivet.serverId,
				),
			);
		}

		return { lobbyId: lobby.id, playerIds };
	}

	async #waitForLobbyReady(lobbyId: string): Promise<State.Lobby> {
		// Check the lobby state
		const { status, lobby: newLobby } = this.#getLobbyStatus(lobbyId);
		switch (status) {
			case "unready":
				// Do nothing
				break;
			case "ready":
				invariant(
					newLobby !== undefined,
					"newLobby is undefined with ready state",
				);
				return newLobby;
			case "aborted": {
				const destroyMeta = this.#lobbyDestroyMeta[lobbyId];
				if (destroyMeta?.cause) {
					throw destroyMeta.cause;
				} else {
					throw new LobbyAbortedError({
						reason: destroyMeta?.reason,
					});
				}
			}
			default:
				assertUnreachable(status);
		}

		// Wait for lobby to be ready
		//
		// If the lobby is never ready, it will time out from the GC destroying the
		// lobby.
		return await new Promise((resolve, reject) => {
			// Wait for lobby ready
			const unsubscribe = this.#emitter.on(
				EVENT_KEYS.lobbyUpdate(lobbyId),
				() => {
					const { status, lobby: newLobby } = this.#getLobbyStatus(lobbyId);
					switch (status) {
						case "unready":
							// Do nothing
							break;
						case "ready":
							invariant(
								newLobby !== undefined,
								"newLobby is undefined with ready state",
							);
							unsubscribe();
							resolve(newLobby);
							break;
						case "aborted": {
							unsubscribe();

							const destroyMeta = this.#lobbyDestroyMeta[lobbyId];
							if (destroyMeta?.cause) {
								reject(destroyMeta.cause);
							} else {
								reject(new LobbyAbortedError({ reason: destroyMeta?.reason }));
							}
							break;
						}
						default:
							assertUnreachable(status);
					}
				},
			);
		});
	}

	/**
	 * The state of the server.
	 */
	#getLobbyStatus(lobbyId: string): {
		status: "unready" | "ready" | "aborted";
		lobby?: State.Lobby;
	} {
		const lobby = this.#lobbies[lobbyId];
		if (!lobby) {
			return { status: "aborted" };
		} else if (lobby.readyAt) {
			return { status: this.#getLobbyBackendStatus(lobby), lobby };
		} else {
			return { status: "unready", lobby };
		}
	}

	/**
	 * If the lobby backend is ready for players to start connecting.
	 */
	#getLobbyBackendStatus(lobby: State.Lobby): "unready" | "ready" | "aborted" {
		if ("test" in lobby.backend) {
			return "ready";
		} else if ("localDevelopment" in lobby.backend) {
			return "ready";
		} else if ("rivet" in lobby.backend) {
			const server = this.#servers[lobby.backend.rivet.serverId];
			if (server) {
				if (server.rivetActor) {
					return "ready";
				} else {
					return "unready";
				}
			} else {
				return "aborted";
			}
		} else {
			assertUnreachable(lobby.backend);
		}
	}

	#resolveLobbyFromRequest(req: { lobbyId?: string; lobbyToken?: string }): {
		lobbyId: string;
		hasLobbyToken: boolean;
	} {
		// Validate token
		let lobbyId: string;
		let hasLobbyToken: boolean;
		if (req.lobbyToken) {
			lobbyId = this.#lobbyForToken(req.lobbyToken);
			hasLobbyToken = true;
		} else if (req.lobbyId) {
			lobbyId = req.lobbyId;
			hasLobbyToken = false;
		} else if ("localDevelopment" in this.#config.lobbies.backend) {
			// Default to local lobby if neither lboby or token is provided
			lobbyId = LOCAL_LOBBY_ID;
			hasLobbyToken = false;
		} else {
			throw new LobbyTokenRequiredError();
		}

		return { lobbyId, hasLobbyToken };
	}

	#lobbyForToken(lobbyToken: string) {
		const lobby = Object.values(this.#currentState.lobbies).find(
			(l) => l.token === lobbyToken,
		);
		if (!lobby) throw new LobbyTokenInvalidError();
		return lobby.id;
	}

	#playerForTokens(lobbyId: string, playerTokens: string[]) {
		const lobby = this.#getLobby(lobbyId);
		const players = Object.values(lobby.players).filter((p) =>
			playerTokens.includes(p.token),
		);
		if (playerTokens.length !== players.length)
			throw new PlayerTokenInvalidError();
		return players.map((p) => p.id);
	}

	#buildLobbyResponse(lobbyId: string): LobbyResponse {
		const lobby = this.#getLobby(lobbyId);
		const lobbyConfig = getLobbyConfig(this.#config, lobby.tags);

		// Build backend
		let backend: LobbyBackendResponse;
		if ("test" in lobby.backend) {
			backend = { test: {} };
		} else if ("localDevelopment" in lobby.backend) {
			backend = {
				localDevelopment: {
					ports: lobby.backend.localDevelopment.ports,
				},
			};
		} else if ("rivet" in lobby.backend) {
			const server = this.#servers[lobby.backend.rivet.serverId];
			if (!server) throw new Error("server not found");

			const rivetActor = server.rivetActor;
			if (rivetActor) {
				const ports: Record<string, Rivet.actor.Port> = {};
				for (const [k, v] of Object.entries(rivetActor.network.ports)) {
					ports[k] = {
						protocol: v.protocol,
						internalPort: v.internalPort,
						hostname: v.hostname,
						port: v.port,
						routing: v.routing,
					};
				}

				backend = {
					rivet: {
						serverId: lobby.backend.rivet.serverId,
						ports,
					},
				};
			} else {
				backend = {
					rivet: {
						serverId: lobby.backend.rivet.serverId,
						ports: {},
					},
				};
			}
		} else {
			assertUnreachable(lobby.backend);
		}

		// Get region
		const allRegions = regionsForBackend(lobbyConfig.backend);
		const region = allRegions.find((x) => x.slug === lobby.region);
		invariant(region !== undefined, "could not find region for lobby");

		return {
			id: lobby.id,
			version: lobby.version,
			tags: lobby.tags,
			region,
			createdAt: lobby.createdAt,
			readyAt: lobby.readyAt,
			players: Object.keys(lobby.players).length,
			maxPlayers: lobby.maxPlayers,
			maxPlayersDirect: lobby.maxPlayersDirect,
			backend,
		};
	}

	#buildPlayersResponse(
		lobbyId: string,
		playerIds: string[],
	): PlayerResponseWithToken[] {
		const lobby = this.#getLobby(lobbyId);

		const players = [];
		for (const playerId of playerIds) {
			const player = lobby.players[playerId];
			if (player) players.push({ id: playerId, token: player.token });
		}

		return players;
	}

	async #createServerBackground(
		lobby: State.Lobby,
		lobbyConfig: LobbyConfig,
		serverId: string,
	) {
		try {
			await this.#createServerBackgroundInner(lobby, lobbyConfig, serverId);
		} catch (error) {
			this._log.warn("create lobby background failed, destroying lobby", {
				error,
			});

			this.#destroyLobby({
				lobbyId: lobby.id,
				reason: `${error}`,
				cause: error instanceof ActorError ? error : undefined,
			});
		}
	}

	async #createServerBackgroundInner(
		lobby: State.Lobby,
		lobbyConfig: LobbyConfig,
		serverId: string,
	) {
		// TODO: Race condition with publishign & deleting lobby if delete request gets processed first

		if (!("rivet" in lobbyConfig.backend)) return;

		// Build ports
		const ports: Record<string, Rivet.actor.CreateActorPortRequest> = {};
		for (const [k, v] of Object.entries(lobbyConfig.backend.rivet.ports)) {
			ports[k] = {
				protocol: v.protocol,
				internalPort: v.internalPort,
				routing: v.routing,
			};
		}
		const {
			client: rivet,
			project,
			environment,
		} = createRivetClient(this.#config);

		// TODO: Cache this
		// Lookup build
		const buildTags = {
			//[VERSION_BUILD_TAG]: lobby.version,
			name: TEMP_GAME_BUILD_TAG_VALUE,
			[CURRENT_BUILD_TAG]: "true",
		};

		// Create server
		const serverTags: Record<string, string> = {
			[MANAGER_SERVER_TAG]: MANAGER_SERVER_TAG_VALUE,
			"lobbies/lobby_id": lobby.id,
			"lobbies/version": lobby.version,
		};
		for (const [k, v] of Object.entries(lobby.tags)) {
			serverTags[`lobbies/tags/${k}`] = v;
		}

		const { actor: rivetActor } = await rivet.actor.create({
			project,
			environment,
			body: {
				region: lobby.region,
				tags: serverTags,
				buildTags: buildTags,
				runtime: {
					environment: Object.assign(
						{},
						lobbyConfig.backend.rivet.environment,
						{
							LOBBY_ID: lobby.id,
							LOBBY_VERSION: lobby.version,
							LOBBY_TOKEN: lobby.token,
						},
					),
				},
				network: {
					mode: lobbyConfig.backend.rivet.networkMode,
					ports,
				},
				resources: lobbyConfig.backend.rivet.resources,
			},
		});

		this._log.info("created rivet actor", {
			actor: JSON.stringify(rivetActor),
		});

		// Update server state
		const server = this.#servers[serverId];
		if (server) {
			server.createCompleteAt = Date.now();
			server.rivetActor = {
				id: rivetActor.id,
				network: {
					ports: Object.fromEntries(
						Object.entries(rivetActor.network.ports).map(([k, v]) => [
							k,
							{
								protocol: v.protocol,
								internalPort: v.internalPort,
								hostname: v.hostname,
								port: v.port,
								routing: v.routing,
							},
						]),
					),
				},
			};
		} else {
			// TODO: There is a race condition here

			this._log.warn("server removed before create request finished", {
				serverId: serverId,
				rivetActorId: rivetActor.id,
			});
		}

		this.#emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));
	}

	#destroyLobby(req: { lobbyId: string; reason?: string; cause?: ActorError }) {
		// Get lobby
		const lobby = this.#lobbies[req.lobbyId];
		if (!lobby) {
			throw new LobbyNotFoundError({ lobbyId: req.lobbyId });
		}

		// Check can be deleted
		const lobbyConfig = getLobbyConfig(this.#config, lobby.tags);
		if (!canMutateLobbies(lobbyConfig)) {
			throw new CannotMutateLobbiesError();
		}

		// TODO: Optimize
		// TODO: Handle backends better
		if ("test" in lobby.backend || "localDevelopment" in lobby.backend) {
			// Do nothing
		} else if ("rivet" in lobby.backend) {
			const serverId = lobby.backend.rivet.serverId;

			// Delete server
			const server = this.#servers[serverId];
			if (server) {
				this.#destroyServer({
					serverId,
					reason: "destroy_lobby",
					destroyLobbies: false,
					destroyRivetActor: true,
				});
			} else {
				this._log.warn("did not find server to delete", { serverId: serverId });
			}
		} else {
			assertUnreachable(lobby.backend);
		}

		// Remove lobby
		delete this.#lobbies[req.lobbyId];
		this.#lobbyDestroyMeta[req.lobbyId] = {
			destroyedAt: Date.now(),
			reason: req.reason,
			cause: req.cause,
		};

		this.#emitter.emit(EVENT_KEYS.lobbyUpdate(req.lobbyId));
	}

	#destroyServer({
		serverId,
		reason,
		destroyLobbies,
		destroyRivetActor: destroyRivetActor,
	}: {
		serverId: string;
		reason: string;
		destroyLobbies: boolean;
		destroyRivetActor: boolean;
	}) {
		// HACK: Bug in on-change requires server to be deep cloned
		// Remove server from list
		const server = JSON.parse(JSON.stringify(this.#servers[serverId]));
		if (!server) {
			this._log.warn("tried to delete server that's already deleted", {
				serverId: serverId,
			});
			return;
		}
		delete this.#servers[server.id];
		server.destroyedAt = Date.now();

		// Destroy all lobbies running on this server
		if (destroyLobbies) {
			for (const lobby of Object.values(this.#lobbies)) {
				if (
					"rivet" in lobby.backend &&
					lobby.backend.rivet.serverId === serverId
				) {
					this.#destroyLobby({
						lobbyId: lobby.id,
						reason,
					});
				}
			}
		}

		// Destroy server
		if (destroyRivetActor) {
			this._runInBackground(this.#destroyRivetActorBackground(server));
		}
	}

	async #destroyRivetActorBackground(server: State.Server) {
		if (!server.rivetActor) {
			// TODO: This indicates a race condition with create & delete
			this._log.warn("deleted server without rivet actor", [
				"serverId",
				server.id,
			]);
			return;
		}

		// Destroy server
		const {
			client: rivet,
			project,
			environment,
		} = createRivetClient(this.#config);
		await rivet.actor.destroy(server.rivetActor.id, {
			project,
			environment,
		});
	}

	#findLobby(req: {
		query: RpcSchema.QueryRequest;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	}): {
		lobbyId: string;
		playerIds: string[];
	} {
		const lobby = this.#queryLobby(req.query, req.players.length);
		if (!lobby) {
			throw new NoMatchingLobbiesError({
				playerCount: req.players.length,
				query: req.query,
			});
		}
		const { playerIds } = this.#createPlayers({
			lobbyId: lobby.id,
			players: req.players,
			remoteAddress: req.remoteAddress,
		});
		return { lobbyId: lobby.id, playerIds };
	}

	#findOrCreateLobby(req: {
		query: RpcSchema.QueryRequest;
		lobby: RpcSchema.LobbyRequest;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	}): {
		lobbyId: string;
		playerIds: string[];
	} {
		const lobby = this.#queryLobby(req.query, req.players.length);
		if (lobby) {
			const { playerIds } = this.#createPlayers({
				lobbyId: lobby.id,
				players: req.players,
				remoteAddress: req.remoteAddress,
			});
			return { lobbyId: lobby.id, playerIds };
		} else {
			return this.#createLobby({
				lobby: req.lobby,
				players: req.players,
				remoteAddress: req.remoteAddress,
			});
		}
	}

	#setLobbyReady(req: RpcSchema.SetLobbyReadyRequest) {
		const { lobbyId, hasLobbyToken } = this.#resolveLobbyFromRequest(req);

		// Get lobby. Fail gracefully since there may be a race condition with deleting lobby.
		const lobby = this.#lobbies[lobbyId];
		if (!lobby) {
			this._log.warn("setting lobby ready on lobby that's already removed", {
				lobbyId: lobbyId,
			});
			return;
		}

		const lobbyConfig = getLobbyConfig(this.#config, lobby.tags);

		// Validate token
		if (!hasLobbyToken && requiresLobbyToken(lobbyConfig)) {
			throw new LobbyTokenRequiredError();
		}

		// Update ready state
		if (lobby.readyAt !== undefined) {
			if (canCallLobbyReadyMultipleTimes(lobbyConfig)) {
				// Exit gracefully
				return;
			} else {
				throw new LobbyAlreadyReadyError();
			}
		}

		lobby.readyAt = Date.now();

		this.#emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));
	}

	#createPlayers(req: {
		lobbyId: string;
		players: RpcSchema.PlayerRequest[];
		remoteAddress?: string;
	}): { playerIds: string[] } {
		const lobby = this.#getLobby(req.lobbyId);

		if (req.players.length === 0) {
			return { playerIds: [] };
		}

		// Check for too many players for IP
		if (this.#config.players.maxPerIp !== undefined) {
			// Count the number of IPs for the request
			const reqIpCounts = new Map<string, number>();
			for (const _player of req.players) {
				if (req.remoteAddress) {
					const count = reqIpCounts.get(req.remoteAddress) ?? 0;
					reqIpCounts.set(req.remoteAddress, count + 1);
				}
			}

			// Valdiate IPs
			for (const [ip, reqIpCount] of reqIpCounts) {
				const playersForIp = this.#playersForIp(ip);

				// Calculate the number of players over the max player count,
				// including the player making the request.
				const ipOverflow =
					playersForIp.length + reqIpCount - this.#config.players.maxPerIp;

				// Handle too many players per IP
				if (ipOverflow > 0) {
					// Before throwing an error, we'll try removing players
					// that have not connected to a server yet. This helps
					// mitigate the edge case where the game has a bug causing
					// players to fail to connect, leaving a lot of unconnected
					// players in the lobby manager. In this situation, new
					// players can still be created.
					//
					// If there are unconnected players that can be removed,
					// those players will be removed and this will continue as
					// normal.

					// Find players that have not connected yet, sorted oldest
					// to newest. This does not include the player that is
					// making the request.
					const unconnectedPlayersForIp = playersForIp
						.filter((x) => x.connectedAt === undefined)
						.sort((a, b) => a.createdAt - b.createdAt);

					// Check if there are enough players that we can delete to
					// make space for the new players
					if (unconnectedPlayersForIp.length >= ipOverflow) {
						this._log.warn(
							"removing unconnected player with the same ip to make space for new player. the game server is likely having issues accepting connections.",
							{
								ip: ip,
								ipOverflow: ipOverflow,
								maxPerIp: this.#config.players.maxPerIp,
							},
						);

						// Remove oldest players first in favor of the new
						// player we're about to add
						for (let i = 0; i < ipOverflow; i++) {
							invariant(
								unconnectedPlayersForIp[i] !== undefined,
								"no unconnected player for ip",
							);
							const unconnectedPlayer = unconnectedPlayersForIp[i];
							this.#destroyPlayers(unconnectedPlayer.lobbyId, true, [
								unconnectedPlayer.id,
							]);
						}
					} else {
						// Fail
						throw new TooManyPlayersForIpError({ ip });
					}
				}
			}
		}

		// Check if we need to remove unconnected players
		if (this.#config.players.maxUnconnected !== undefined) {
			const unconnectedPlayers = this.#unconnectedPlayers();

			const unconnectedOverflow =
				unconnectedPlayers.length +
				req.players.length -
				this.#config.players.maxUnconnected;
			if (unconnectedOverflow > 0) {
				// Calc number of players to remove
				const unconnectedPlayersToRemove = Math.min(
					unconnectedOverflow,
					unconnectedPlayers.length,
				);
				this._log.warn(
					"removing unconnected player to make space for new player. the game server is likely having issues accepting connections.",
					{
						maxUnconnected: this.#config.players.maxUnconnected,
						unconnectedOverflow: unconnectedOverflow,
						unconnectedPlayersToRemove: unconnectedPlayersToRemove,
					},
				);

				// Remove unconnected players from oldest to newest
				unconnectedPlayers.sort((a, b) => a.createdAt - b.createdAt);
				for (let i = 0; i < unconnectedPlayersToRemove; i++) {
					invariant(
						unconnectedPlayers[i] !== undefined,
						"no unconnected player for index",
					);
					const player = unconnectedPlayers[i];
					this.#destroyPlayers(player.lobbyId, true, [player.id]);
				}
			}
		}

		// Check for available spots in lobby
		if (lobby.maxPlayers - req.players.length < 0) {
			throw new LobbyFullError({ lobbyId: req.lobbyId });
		}

		// Create players
		const players = [];
		for (const playerOpts of req.players) {
			const playerId = crypto.randomUUID();
			const player: State.Player = {
				id: playerId,
				token: generateToken("player"),
				lobbyId: lobby.id,
				createdAt: Date.now(),
				remoteAddress: req.remoteAddress,
			};
			lobby.players[player.id] = player;
			players.push(player);
		}

		// Make lobby not empty
		lobby.emptyAt = undefined;

		this.#emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));

		return { playerIds: players.map((x) => x.id) };
	}

	#destroyPlayers(
		lobbyId: string,
		hasLobbyToken: boolean,
		playerIds: string[],
	) {
		const lobby = this.#getLobby(lobbyId);
		const lobbyConfig = getLobbyConfig(this.#config, lobby.tags);

		// Validate token
		if (!hasLobbyToken && requiresLobbyToken(lobbyConfig)) {
			throw new LobbyTokenRequiredError();
		}

		// Remove player
		for (const playerId of playerIds) {
			delete lobby.players[playerId];
		}

		// Destroy lobby immediately on empty
		if (Object.keys(lobby.players).length === 0) {
			lobby.emptyAt = Date.now();

			if (
				canMutateLobbies(lobbyConfig) &&
				lobbyConfig.destroyOnEmptyAfter === 0
			) {
				this._log.info("destroying empty lobby", {
					lobbyId: lobby.id,
					unreadyExpireAfter: this.#config.lobbies.unreadyExpireAfter,
				});
				this.#destroyLobby({ lobbyId: lobby.id, reason: "lobby_empty" });
			}
		}

		this.#emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));
	}

	#setPlayersConnected(
		lobbyId: string,
		hasLobbyToken: boolean,
		playerIds: string[],
	) {
		const lobby = this.#getLobby(lobbyId);
		const lobbyConfig = getLobbyConfig(this.#config, lobby.tags);

		// Validate token
		if (!hasLobbyToken && requiresLobbyToken(lobbyConfig)) {
			throw new LobbyTokenRequiredError();
		}

		// Validate players
		const allPlayers = [];
		for (const playerId of playerIds) {
			const player = lobby.players[playerId];
			if (player) {
				// TODO: Allow reusing connection token
				// TODO: What if the player already connected
				if (player.connectedAt !== undefined) {
					throw new PlayerAlreadyConnectedError({
						lobbyId: lobby.id,
						playerId,
					});
				}

				allPlayers.push(player);
			} else {
				throw new PlayerDisconnectedError({ lobbyId: lobby.id, playerId });
			}
		}

		// Update players
		for (const player of allPlayers) {
			player.connectedAt = Date.now();
		}
	}

	async #pollServers() {
		//// Check if Rivet enabled
		//if (!("rivet" in this.#config.lobbies.backend)) return;
		//if (
		//	this.#config.lobbyRules.findIndex(
		//		(x) => x.config.backend && "rivet" in x.config.backend,
		//	) !== -1
		//) {
		//	return;
		//}
		//
		//// Check if there are servers
		//if (Object.keys(this.#servers).length == 0) {
		//	this._log.info("no servers, skipping poll");
		//}
		//
		//// List all servers
		//const serverTags = {
		//	[MANAGER_SERVER_TAG]: MANAGER_SERVER_TAG_VALUE,
		//};
		//const { gameId, environmentId } = await ctx.modules.rivet.fetchConfig({});
		//const {
		//	body: { servers: rivetServers },
		//} = (await ctx.modules.rivet.call({
		//	method: "GET",
		//	path: `/games/${gameId}/environments/${environmentId}/servers?tags_json=${encodeURIComponent(
		//		JSON.stringify(serverTags),
		//	)}`,
		//})) as { body: RivetEndpoints.ListServersResponse };
		//
		//// Check for orphaned servers
		//for (const rivetServer of Object.values(rivetServers)) {
		//	if (
		//		Object.values(this.#servers).findIndex(
		//			(x) => x.rivetServer?.id == rivetServer.id,
		//		) != -1
		//	) {
		//		this._log.warn(
		//			"found orphaned server. this is either from (a) another lobbies module running in parallel or (b) a rare race condition with listing servers & POST server returning.",
		//			["rivetServerId", rivetServer.id],
		//		);
		//	}
		//}
		//
		//// Check for server updates
		//for (const [serverId, server] of Object.entries(this.#servers)) {
		//	// Skip server if create request has not finished creating
		//	if (!server.createCompleteAt || !server.rivetServer) continue;
		//
		//	const rivetServer = rivetServers.find(
		//		(x) => x.id == server.rivetServer?.id,
		//	);
		//
		//	if (rivetServer != undefined) {
		//		// Update server data
		//		server.polledAt = Date.now();
		//		server.rivetServer = rivetServer;
		//
		//		// Mark server as started
		//		if (rivetServer.started_at) {
		//			this._log.info(
		//				"server started",
		//				["serverId", serverId],
		//				["rivetServerId", rivetServer.id],
		//			);
		//
		//			// Save server data
		//			const server = this.#servers[serverId]!;
		//			server.rivetServer = rivetServer;
		//			await this.forceSaveState();
		//
		//			// Update lobby state
		//			for (const lobby of Object.values(this.#lobbies)) {
		//				if (
		//					"rivet" in lobby.backend &&
		//					lobby.backend.rivet.serverId == serverId
		//				) {
		//					this.#emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));
		//				}
		//			}
		//		}
		//	} else {
		//		this._log.warn(
		//			"server terminated. this indicates either (a) the server crashed or (b) the server was manually terminated.",
		//			["serverId", serverId],
		//			["rivetServerId", server.rivetServer.id],
		//		);
		//
		//		this.#destroyServer({
		//			serverId,
		//			reason: "server_terminated",
		//			destroyLobbies: true,
		//			destroyRivetServer: false,
		//		});
		//	}
		//}
	}

	private async _tick() {
		this._schedule.after(this.#config.tickInterval, "_tick");

		const now = Date.now();
		if (now - this.#currentState.lastGcAt >= this.#config.gcInterval) {
			this.#currentState.lastGcAt = now;
			this.#gc();
		}
		if (
			now - this.#currentState.lastServerPollAt >=
			this.#config.pollServersInterval
		) {
			this.#currentState.lastServerPollAt = now;
			await this.#pollServers();
		}
	}

	#gc() {
		// GC destroy meta
		let expiredLobbyDestroyMeta = 0;
		for (const [lobbyId, meta] of Object.entries(this.#lobbyDestroyMeta)) {
			if (Date.now() - meta.destroyedAt > 180_000) {
				expiredLobbyDestroyMeta++;
				delete this.#lobbyDestroyMeta[lobbyId];
			}
		}

		// GC lobbies
		let unreadyLobbies = 0;
		let emptyLobbies = 0;
		let unconnectedPlayers = 0;
		let oldPlayers = 0;
		for (const lobby of Object.values(this.#lobbies)) {
			const lobbyConfig = getLobbyConfig(this.#config, lobby.tags);

			// Destroy lobby if unready
			if (
				canMutateLobbies(lobbyConfig) &&
				lobby.readyAt === undefined &&
				Date.now() - lobby.createdAt > this.#config.lobbies.unreadyExpireAfter
			) {
				this._log.warn("destroying unready lobby", {
					lobbyId: lobby.id,
					unreadyExpireAfter: this.#config.lobbies.unreadyExpireAfter,
				});
				this.#destroyLobby({
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
				this._log.debug("destroying empty lobby", {
					lobbyId: lobby.id,
					unreadyExpireAfter: this.#config.lobbies.unreadyExpireAfter,
				});
				this.#destroyLobby({ lobbyId: lobby.id, reason: "lobby_empty" });
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
						Date.now() - startAt > this.#config.players.unconnectedExpireAfter
					) {
						this._log.debug("destroying unconnected player", {
							playerId: player.id,

							unconnectedExpireAfter:
								this.#config.players.unconnectedExpireAfter,
						});
						this.#destroyPlayers(player.lobbyId, true, [player.id]);
						unconnectedPlayers++;
						continue;
					}

					// Clean up really old players
					if (
						this.#config.players.autoDestroyAfter !== undefined &&
						Date.now() - startAt > this.#config.players.autoDestroyAfter
					) {
						this._log.warn("destroying old player", {
							playerId: player.id,
							autoDestroyAfter: this.#config.players.autoDestroyAfter,
						});
						this.#destroyPlayers(player.lobbyId, true, [player.id]);
						oldPlayers++;
					}
				}
			}
		}

		this._log.info("gc summary", {
			expiredLobbyDestroyMeta: expiredLobbyDestroyMeta,
			unreadyLobbies: unreadyLobbies,
			emptyLobbies: emptyLobbies,
			unconnectedPlayers: unconnectedPlayers,
			oldPlayers: oldPlayers,
		});
	}

	/**
	 * Returns a lobby or throws `lobby_not_found`.
	 */
	#getLobby(lobbyId: string): State.Lobby {
		const lobby = this.#lobbies[lobbyId];
		if (lobby === undefined) {
			throw new LobbyNotFoundError({ lobbyId });
		}
		return lobby;
	}

	/**
	 * Finds a lobby for a given query.
	 */
	#queryLobby(
		query: RpcSchema.QueryRequest,
		playerCount: number,
	): State.Lobby | undefined {
		// TODO: optimize
		// Find largest lobby that can fit the requested players
		const lobbies = Object.values(this.#lobbies)
			.map<[State.Lobby, LobbyConfig]>((lobby) => [
				lobby,
				getLobbyConfig(this.#config, lobby.tags),
			])
			.filter(
				([x, config]) =>
					x.version === query.version || acceptAnyVersion(config),
			)
			.filter(
				([x, config]) =>
					query.regions === undefined ||
					query.regions.includes(x.region) ||
					acceptAnyRegion(config),
			)
			.filter(
				([x, _]) => Object.keys(x.players).length <= x.maxPlayers - playerCount,
			)
			.filter(
				([x, _]) =>
					query.tags === undefined || lobbyTagsMatch(query.tags, x.tags),
			)
			.map(([x, _]) => x)
			.sort((a, b) => b.createdAt - a.createdAt)
			.sort(
				(a, b) => Object.keys(b.players).length - Object.keys(a.players).length,
			);
		return lobbies[0];
	}

	#playersForIp(ip: string): State.Player[] {
		// TODO: optimize
		const players = [];
		for (const lobby of Object.values(this.#lobbies)) {
			for (const player of Object.values(lobby.players)) {
				if (player.remoteAddress === ip) {
					players.push(player);
				}
			}
		}
		return players;
	}

	#unconnectedPlayers(): State.Player[] {
		// TODO: optimize
		const players = [];
		for (const lobby of Object.values(this.#lobbies)) {
			// Don't count unready lobbies since these players haven't had time to connect yet
			if (lobby.readyAt === undefined) continue;

			for (const player of Object.values(lobby.players)) {
				if (player.connectedAt === undefined) {
					players.push(player);
				}
			}
		}
		return players;
	}
}

interface LobbyDestroyMeta {
	destroyedAt: number;
	reason?: string;
	cause?: ActorError;
}
