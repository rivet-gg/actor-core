import type { GlobalState } from "@/topologies/coordinate/topology";
import { logger } from "../log";
import { encodeDataToString, serialize } from "@/actor/protocol/serde";
import type { CoordinateDriver } from "../driver";
import { RelayConn } from "../conn/mod";
import type { ActorDriver } from "@/actor/driver";
import { DriverConfig } from "@/driver-helpers/config";
import { AppConfig } from "@/app/config";
import { ConnectSseOpts, ConnectSseOutput } from "@/actor/router-endpoints";

export async function serveSse(
	appConfig: AppConfig,
	driverConfig: DriverConfig,
	actorDriver: ActorDriver,
	CoordinateDriver: CoordinateDriver,
	globalState: GlobalState,
	actorId: string,
	{ encoding, params }: ConnectSseOpts,
): Promise<ConnectSseOutput> {
	let conn: RelayConn | undefined;
	return {
		onOpen: async (stream) => {
			conn = new RelayConn(
				appConfig,
				driverConfig,
				actorDriver,
				CoordinateDriver,
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
				params,
			);
			await conn.start();
		},
		onClose: async () => {
			conn?.disconnect(false);
		},
	};
}
