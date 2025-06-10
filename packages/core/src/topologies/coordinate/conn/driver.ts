import type { ConnDriver } from "@/worker/driver";
import type { GlobalState } from "../topology";
import type { AnyWorkerInstance } from "@/worker/instance";
import type { AnyConn, Conn } from "@/worker/connection";
import type { CachedSerializer } from "@/worker/protocol/serde";
import type * as messageToClient from "@/worker/protocol/message/to-client";
import { logger } from "../log";
import type { NodeMessage } from "../node/protocol";
import type { CoordinateDriver } from "../driver";

export const CONN_DRIVER_COORDINATE_RELAY = "coordinateRelay";

export interface CoordinateRelayState {
	nodeId: string;
}

export function createCoordinateRelayDriver(
	globalState: GlobalState,
	CoordinateDriver: CoordinateDriver,
): ConnDriver<CoordinateRelayState> {
	return {
		sendMessage: (
			worker: AnyWorkerInstance,
			conn: AnyConn,
			state: CoordinateRelayState,
			message: CachedSerializer<messageToClient.ToClient>,
		) => {
			const workerPeer = globalState.workerPeers.get(worker.id);
			if (!workerPeer) {
				logger().warn("missing worker for message", { workerId: worker.id });
				return;
			}

			// Forward outoging message
			const messageRaw: NodeMessage = {
				b: {
					fm: {
						ci: conn.id,
						m: message.rawData,
					},
				},
			};
			CoordinateDriver.publishToNode(state.nodeId, JSON.stringify(messageRaw));
		},
		disconnect: async (
			worker: AnyWorkerInstance,
			conn: AnyConn,
			state: CoordinateRelayState,
			reason?: string,
		) => {
			if (worker.isStopping) return;

			const workerPeer = globalState.workerPeers.get(worker.id);
			if (!workerPeer) {
				logger().warn("missing worker for disconnect", { workerId: worker.id });
				return;
			}

			// Forward close message
			const messageRaw: NodeMessage = {
				b: {
					fcc: {
						ci: conn.id,
						r: reason,
					},
				},
			};
			CoordinateDriver.publishToNode(state.nodeId, JSON.stringify(messageRaw));
		},
	};
}
