import { Config, LobbyConfig } from "@/config";
import { EVENT_KEYS, LobbyManagerContext } from "./mod";
import type * as State from "@/utils/lobby_manager/state/mod";
import { destroyLobby } from "./lobby";
import { Emitter } from "nanoevents";
import { Rivet } from "@rivet-gg/api";
import { createRivetClient } from "@/utils/lobby/backend/rivet";
import { currentState } from "./state";

const OWNER_TAG = "owner";
const OWNER_TAG_VALUE = "lobby-manager";

//const VERSION_BUILD_TAG = "version";
//const ENABLED_BUILD_TAG = "enabled";
const CURRENT_BUILD_TAG = "current";

// TODO: replace this with the config
const TEMP_GAME_BUILD_TAG_VALUE = "game";

export async function createServerBackground(
	c: LobbyManagerContext,
	lobby: State.Lobby,
	lobbyConfig: LobbyConfig,
	serverId: string,
) {
	try {
		await createServerBackgroundInner(
			c,
			lobby,
			lobbyConfig,
			serverId,
		);
	} catch (error) {
		c.log.warn("create lobby background failed, destroying lobby", {
			error,
		});

		destroyLobby(c,  {
			lobbyId: lobby.id,
			reason: `${error}`,
			cause: error
		});
	}
}

export async function createServerBackgroundInner(
	c: LobbyManagerContext,
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
	} = createRivetClient(c.vars.config, lobby.region);

	// TODO: Cache this
	// Lookup build
	const buildTags = {
		//[VERSION_BUILD_TAG]: lobby.version,
		name: TEMP_GAME_BUILD_TAG_VALUE,
		[CURRENT_BUILD_TAG]: "true",
	};

	// Create server
	const serverTags: Record<string, string> = {
		[OWNER_TAG]: OWNER_TAG_VALUE,
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
				environment: Object.assign({}, lobbyConfig.backend.rivet.environment, {
					LOBBY_ID: lobby.id,
					LOBBY_VERSION: lobby.version,
					LOBBY_TOKEN: lobby.token,
				}),
			},
			network: {
				mode: lobbyConfig.backend.rivet.networkMode,
				ports,
			},
			resources: lobbyConfig.backend.rivet.resources,
		},
	});

	c.log.info("created rivet actor", {
		actor: JSON.stringify(rivetActor),
	});

	// Update server state
	const server = currentState(c).servers[serverId];
	if (server) {
		server.createCompleteAt = Date.now();
		server.rivetActor = {
			id: rivetActor.id,
			region: rivetActor.region,
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

		c.log.warn("server removed before create request finished", {
			serverId: serverId,
			rivetActorId: rivetActor.id,
		});
	}

	c.vars.emitter.emit(EVENT_KEYS.lobbyUpdate(lobby.id));
}

export function destroyServer(
	c: LobbyManagerContext,
	{
		serverId,
		reason,
		destroyLobbies,
		destroyRivetActor,
	}: {
		serverId: string;
		reason: string;
		destroyLobbies: boolean;
		destroyRivetActor: boolean;
	},
) {
	// HACK: Bug in on-change requires server to be deep cloned
	// Remove server from list
	const server = JSON.parse(JSON.stringify(currentState(c).servers[serverId]));
	if (!server) {
		c.log.warn("tried to delete server that's already deleted", {
			serverId: serverId,
		});
		return;
	}
	delete currentState(c).servers[server.id];
	server.destroyedAt = Date.now();

	// Destroy all lobbies running on this server
	if (destroyLobbies) {
		for (const lobby of Object.values(currentState(c).lobbies)) {
			if (
				"rivet" in lobby.backend &&
				lobby.backend.rivet.serverId === serverId
			) {
				destroyLobby(c,  {
					lobbyId: lobby.id,
					reason,
				});
			}
		}
	}

	// Destroy server
	if (destroyRivetActor) {
		c.runInBackground(destroyRivetActorBackground(c,  server));
	}
}

export async function destroyRivetActorBackground(
	c: LobbyManagerContext,
	server: State.Server,
) {
	if (!server.rivetActor) {
		// TODO: This indicates a race condition with create & delete
		c.log.warn("deleted server without rivet actor", ["serverId", server.id]);
		return;
	}

	// Destroy server
	const {
		client: rivet,
		project,
		environment,
	} = createRivetClient(c.vars.config, server.rivetActor.region);
	await rivet.actor.destroy(server.rivetActor.id, {
		project,
		environment,
	});
}

export async function pollServers(c: LobbyManagerContext) {
	// Check if Rivet enabled
	if (!("rivet" in c.vars.config.lobbies.backend)) return;
	if (
		c.vars.config.lobbyRules.findIndex(
			(x) => x.config.backend && "rivet" in x.config.backend,
		) !== -1
	) {
		return;
	}

	// Check if there are servers
	if (Object.keys(currentState(c).servers).length === 0) {
		c.log.info("no servers, skipping poll");
	}

	const { client: rivet, project, environment } = createRivetClient(c.vars.config);

	// List regions
	const { regions } = await rivet.actor.regions.list({
		project,
		environment,
	});

	const promises = [];
	for (const region of regions) {
		const promise = pollServersForRegion(c,  region.id).catch(
			(error) => {
				c.log.warn("failed to poll region", {
					region: region.id,
					error: `${error}`,
				});
			},
		);
		promises.push(promise);
	}
	await Promise.all(promises);
}

export async function pollServersForRegion(
	c: LobbyManagerContext,
	region: string,
) {
	//throw "UNIMLEMENTED";

	//const {
	//	client: rivet,
	//	project,
	//	environment,
	//} = createRivetClient(config, region);
	//
	//// List all servers
	//const serverTags = {
	//	[OWNER_TAG]: OWNER_TAG_VALUE,
	//};
	//
	//// List all actors
	//const rivetActors = [];
	//let cursor = undefined;
	//while (true) {
	//	// Don't include destroyed servers in order to keep the responses short. We assume an absent server is destroyed.
	//	const { actors, pagination } = await rivet.actor.list({
	//		project,
	//		environment,
	//		tagsJson: JSON.stringify(serverTags),
	//		cursor,
	//	});
	//	rivetActors.push(...actors);
	//	if (actors.length > 0 && pagination.cursor) {
	//		cursor = pagination.cursor;
	//	} else {
	//		break;
	//	}
	//}
	//
	//// Check for orphaned servers
	//for (const rivetActor of Object.values(rivetActors)) {
	//	if (
	//		Object.values(currentState(c).servers).findIndex(
	//			(x) => x.rivetActor?.id === rivetActor.id,
	//		) !== -1
	//	) {
	//		c.log.warn(
	//			"found orphaned server. this is either from (a) another lobbies module running in parallel or (b) a rare race condition with listing servers & POST server returning.",
	//			{ rivetActorId: rivetActor.id },
	//		);
	//	}
	//}
	//
	//// Check for server updates
	//for (const [serverId, server] of Object.entries(currentState(c).servers)) {
	//	// Skip server if create request has not finished creating
	//	if (!server.createCompleteAt || !server.rivetActor) continue;
	//
	//	const rivetActor = rivetActors.find((x) => x.id === server.rivetActor?.id);
	//
	//	if (rivetActor !== undefined) {
	//		// Update server data
	//		server.polledAt = Date.now();
	//	} else {
	//		// Server terminated
	//		c.log.warn(
	//			"server terminated not by this matchmaker. this indicates either (a) the server crashed or (b) the server was manually terminated.",
	//			{
	//				serverId,
	//				rivetActorId: server.rivetActor.id,
	//			},
	//		);
	//
	//		destroyServer(c, config, emitter, {
	//			serverId,
	//			reason: "server_terminated",
	//			destroyLobbies: true,
	//			destroyRivetActor: false,
	//		});
	//	}
	//}
}
