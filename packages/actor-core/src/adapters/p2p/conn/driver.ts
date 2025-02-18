import type { ConnectionDriver } from "@/actor/runtime/driver";
import type { GlobalState } from "../router/mod";
import type { AnyActor } from "@/actor/runtime/actor";
import type { Connection } from "@/actor/runtime/connection";
import type { CachedSerializer } from "@/actor/protocol/serde";
import type * as messageToClient from "@/actor/protocol/message/to_client";
import { logger } from "../log";
import type { NodeMessage } from "../node/protocol";
import type { P2PDriver } from "../driver";

export const CONN_DRIVER_P2P_RELAY = "p2pRelay";

export interface P2PRelayState {
	nodeId: string;
}

export function createP2pRelayDriver(
	globalState: GlobalState,
	p2pDriver: P2PDriver,
): ConnectionDriver<P2PRelayState> {
	return {
		sendMessage: (
			actor: AnyActor,
			conn: Connection<AnyActor>,
			state: P2PRelayState,
			message: CachedSerializer<messageToClient.ToClient>,
		) => {
			const actorPeer = globalState.actorPeers.get(actor.id);
			if (!actorPeer) {
				logger().warn("missing actor for message", { actorId: actor.id });
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
			p2pDriver.publishToNode(state.nodeId, JSON.stringify(messageRaw));
		},
		disconnect: async (
			actor: AnyActor,
			conn: Connection<AnyActor>,
			state: P2PRelayState,
			reason?: string,
		) => {
			if (actor.__isStopping) return;

			const actorPeer = globalState.actorPeers.get(actor.id);
			if (!actorPeer) {
				logger().warn("missing actor for disconnect", { actorId: actor.id });
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
			p2pDriver.publishToNode(state.nodeId, JSON.stringify(messageRaw));
		},
	};
}
