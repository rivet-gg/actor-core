import type { GlobalState } from "@/adapters/p2p/router/mod";
import { logger } from "../log";
import { encodeDataToString, serialize } from "@/actor/protocol/serde";
import type { BaseConfig, ConnectSseOpts, ConnectSseOutput } from "@/platform";
import type { P2PDriver } from "../driver";
import { RelayConnection } from "../conn/mod";
import type { ActorDriver } from "@/actor/runtime/driver";

export async function serveSse(
	config: BaseConfig,
	p2pDriver: P2PDriver,
	actorDriver: ActorDriver,
	globalState: GlobalState,
	actorId: string,
	{ encoding, parameters }: ConnectSseOpts,
): Promise<ConnectSseOutput> {
	let conn: RelayConnection | undefined;
	return {
		onOpen: async (stream) => {
			conn = new RelayConnection(
				config,
				p2pDriver,
				actorDriver,
				globalState,
				{
					sendMessage: (message) => {
						stream.writeSSE({
							data: encodeDataToString(serialize(message, encoding)),
						});
					},
					disconnect: async (reason) => {
						logger().debug("closing follower stream", { reason });
						stream.close();
					},
				},
				actorId,
				parameters,
			);
			await conn.start();
		},
		onClose: async () => {
			conn?.disconnect(false);
		},
	};
}
