import type { GlobalState } from "@/adapters/p2p/router/mod";
import type { WSContext } from "hono/ws";
import type {
    BaseConfig,
	ConnectWebSocketOpts,
	ConnectWebSocketOutput,
} from "@/platform";
import { logger } from "../log";
import { serialize } from "@/actor/protocol/serde";
import type * as messageToServer from "@/actor/protocol/message/to_server";
import * as errors from "@/actor/errors";
import type { P2PDriver } from "../driver";
import { RelayConnection } from "../conn/mod";
import { publishMessageToLeader } from "../node/message";
import type { ActorDriver } from "@/actor/runtime/driver";

export async function serveWebSocket(
	config: BaseConfig,
	p2pDriver: P2PDriver,
	actorDriver: ActorDriver,
	globalState: GlobalState,
	actorId: string,
	{ req, encoding, parameters }: ConnectWebSocketOpts,
): Promise<ConnectWebSocketOutput> {
	let conn: RelayConnection | undefined;
	return {
		onOpen: async (ws: WSContext) => {
			conn = new RelayConnection(
				config,
				p2pDriver,
				actorDriver,
				globalState,
				{
					sendMessage: (message) => {
						ws.send(serialize(message, encoding));
					},
					disconnect: async (reason) => {
						logger().debug("closing follower stream", { reason });
						ws.close();
					},
				},
				actorId,
				parameters,
			);
			await conn.start();
		},
		onMessage: async (message: messageToServer.ToServer) => {
			if (!conn) {
				throw new errors.InternalError("Connection not created yet");
			}

			await publishMessageToLeader(
				config,
				p2pDriver,
				globalState,
				actorId,
				{
					b: {
						lm: {
							ai: actorId,
							ci: conn.connId,
							ct: conn.connToken,
							m: message,
						},
					},
				},
				req.raw.signal,
			);
		},
		onClose: async () => {
			if (!conn) {
				throw new errors.InternalError("Connection not created yet");
			}

			conn.disconnect(false);
		},
	};
}
