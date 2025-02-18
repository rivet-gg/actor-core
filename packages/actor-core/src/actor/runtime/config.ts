import type { AnyActorConstructor } from "./actor";

export const DEFAULT_ROUTER_MAX_CONNECTION_PARAMETER_SIZE = 8_192;
export const DEFAULT_ROUTER_MAX_INCOMING_MESSAGE_SIZE = 65_536;

export const DEFAULT_ACTOR_PEER_LEASE_DURATION = 3000;
export const DEFAULT_ACTOR_PEER_RENEW_LEASE_GRACE = 1500;
export const DEFAULT_ACTOR_PEER_CHECK_LEASE_INTERVAL = 1000;
export const DEFAULT_ACTOR_PEER_CHECK_LEASE_JITTER = 500;
export const DEFAULT_ACTOR_PEER_MESSAGE_ACK_TIMEOUT = 1000;

/** Base config used for the actor config across all platforms. */
export interface BaseConfig {
	actors: Record<string, AnyActorConstructor>;
	//drivers: {
	//	actor: ActorStorageDriver;
	//	manager: ManagerStorageDriver;
	//	p2p: P2PDriver;
	//	connections: Record<string, ConnectionDriver>;
	//};
	router?: {
		/** This goes in the URL so it needs to be short. */
		maxConnectionParametersSize?: number;

		maxIncomingMessageSize?: number;
	};
	actorPeer?: {
		/**
		 * How long the actor leader holds a lease for.
		 *
		 * Milliseconds
		 **/
		leaseDuration?: number;
		/**
		 * How long before the lease will expire to issue the renew command.
		 *
		 * Milliseconds
		 */
		renewLeaseGrace?: number;
		/**
		 * How frequently the followers check if the leader is still active.
		 *
		 * Milliseconds
		 */
		checkLeaseInterval?: number;
		/**
		 * Positive jitter for check lease interval
		 *
		 * Milliseconds
		 */
		checkLeaseJitter?: number;
		/**
		 * How long to wait for a message ack.
		 *
		 * Milliseconds
		 */
		messageAckTimeout?: number;
	};
}
