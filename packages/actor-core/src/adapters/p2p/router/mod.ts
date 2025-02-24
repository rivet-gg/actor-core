import { BaseConfig, createActorRouter, Manager } from "@/platform";
import { serveSse } from "./sse";
import { serveWebSocket } from "./websocket";
import { Node } from "../node/mod";
import type { ActorPeer } from "../actor_peer";
import * as errors from "@/actor/errors";
import * as events from "node:events";
import type { P2PDriver } from "../driver";
import type { ActorDriver, ManagerDriver } from "@/actor/runtime/driver";
import { publishMessageToLeader } from "../node/message";
import type { RelayConnection } from "../conn/mod";
import type {
	Hono,
	Context as HonoContext,
	Handler as HonoHandler,
} from "hono";

export interface RouterConfig {
	// This is dynamic since NodeJS requires a reference to the app to initialize WebSockets
	getUpgradeWebSocket?: (
		app: Hono,
	) => (createEvents: (c: HonoContext) => any) => HonoHandler;
}

export interface GlobalState {
	nodeId: string;
	/** Actors currently running on this instance. */
	actorPeers: Map<string, ActorPeer>;
	/** Connections that are connected to this node. */
	relayConnections: Map<string, RelayConnection>;
	/** Resolvers for when a message is acknowledged by the peer. */
	messageAckResolvers: Map<string, () => void>;
}

export function createRouter(
	config: BaseConfig,
	p2pDriver: P2PDriver,
	actorDriver: ActorDriver,
	managerDriver: ManagerDriver,
	routerConfig: RouterConfig,
) {
	// Allow usage of a lot of AbortSignals (which are EventEmitters)
	//events.defaultMaxListeners = 100_000;
	events.setMaxListeners(100_000);

	const globalState: GlobalState = {
		nodeId: crypto.randomUUID(),
		actorPeers: new Map(),
		relayConnections: new Map(),
		messageAckResolvers: new Map(),
	};

	const node = new Node(p2pDriver, globalState);
	node.start();

	const manager = new Manager(managerDriver);

	const app = manager.router;

	// Forward requests to actor
	const actorRouter = createActorRouter(config, {
		upgradeWebSocket: routerConfig.getUpgradeWebSocket?.(app),
		onConnectWebSocket: async (opts) => {
			const actorId = opts.req.param("actorId");
			if (!actorId) throw new errors.InternalError("Missing actor ID");
			return await serveWebSocket(config, p2pDriver, actorDriver, globalState, actorId, opts);
		},
		onConnectSse: async (opts) => {
			const actorId = opts.req.param("actorId");
			if (!actorId) throw new errors.InternalError("Missing actor ID");
			return await serveSse(config, p2pDriver, actorDriver, globalState, actorId, opts);
		},
		onRpc: async () => {
			// TODO:
			throw new errors.InternalError("UNIMPLEMENTED");
		},
		onConnectionsMessage: async ({ req, connId, connToken, message }) => {
			const actorId = req.param("actorId");
			if (!actorId) throw new errors.InternalError("Missing actor ID");

			await publishMessageToLeader(
				config,
				p2pDriver,
				globalState,
				actorId,
				{
					b: {
						lm: {
							ai: actorId,
							ci: connId,
							ct: connToken,
							m: message,
						},
					},
				},
				req.raw.signal,
			);
		},
	});

	app.route("/actors/:actorId", actorRouter);

	app.all("*", (c) => {
		return c.text("Not Found (ActorCore)", 404);
	});

	return app;
}
