import {
	DEFAULT_ACTOR_PEER_CHECK_LEASE_INTERVAL,
	DEFAULT_ACTOR_PEER_CHECK_LEASE_JITTER,
	DEFAULT_ACTOR_PEER_LEASE_DURATION,
	DEFAULT_ACTOR_PEER_RENEW_LEASE_GRACE,
} from "@/actor/runtime/config";
import type { AnyActor, BaseConfig } from "@/platform";
import type { GlobalState } from "@/adapters/p2p/router/mod";
import { logger } from "./log";
import type { P2PDriver } from "./driver";
import type { Actor } from "@/actor/runtime/actor";
import type { ActorTags } from "@/common/utils";
import { ActorDriver } from "@/actor/runtime/driver";
import { CONN_DRIVER_P2P_RELAY, createP2pRelayDriver } from "./conn/driver";

export class ActorPeer {
	#config: BaseConfig;
	#p2pDriver: P2PDriver;
	#actorDriver: ActorDriver;
	#globalState: GlobalState;
	#actorId: string;
	#actorTags?: ActorTags;
	#isDisposed = false;

	/** Connections that hold a reference to this actor. If this set is empty, the actor should be shut down. */
	#referenceConnections = new Set<string>();

	/** Node ID that's the leader for this actor. */
	#leaderNodeId?: string;

	/** Holds the insantiated actor class if is leader. */
	#loadedActor?: Actor;

	#heartbeatTimeout?: NodeJS.Timeout;

	get #isLeader() {
		return this.#leaderNodeId === this.#globalState.nodeId;
	}

	get leaderNodeId() {
		if (!this.#leaderNodeId) throw new Error("Not found leader node ID yet");
		return this.#leaderNodeId;
	}

	constructor(
		config: BaseConfig,
		p2pDriver: P2PDriver,
		actorDriver: ActorDriver,
		globalState: GlobalState,
		actorId: string,
	) {
		this.#config = config;
		this.#p2pDriver = p2pDriver;
		this.#actorDriver = actorDriver;
		this.#globalState = globalState;
		this.#actorId = actorId;
	}

	/** Acquires a `ActorPeer` for a connection and includes the connection ID in the references. */
	static async acquire(
		config: BaseConfig,
		p2pDriver: P2PDriver,
		actorDriver: ActorDriver,
		globalState: GlobalState,
		actorId: string,
		connId: string,
	): Promise<ActorPeer> {
		let peer = globalState.actorPeers.get(actorId);

		// Create peer if needed
		if (!peer) {
			peer = new ActorPeer(config, p2pDriver, actorDriver, globalState, actorId);
			globalState.actorPeers.set(actorId, peer);
			await peer.#start();
		}

		peer.#referenceConnections.add(connId);

		logger().debug("added actor reference", {
			actorId,
			connId,
			newReferenceCount: peer.#referenceConnections.size,
		});

		return peer;
	}

	static getLeaderActor(
		globalState: GlobalState,
		actorId: string,
	): AnyActor | undefined {
		const peer = globalState.actorPeers.get(actorId);
		if (!peer) return undefined;
		if (peer.#isLeader) {
			const actor = peer.#loadedActor;
			if (!actor)
				throw new Error("Actor is leader, but loadedActor is undefined");
			return actor;
		} else {
			return undefined;
		}
	}

	async #start() {
		// TODO: Handle errors graecfully
		// TODO: See redlock

		// TODO: renew lease
		// TODO: receive messages for new connections
		// TODO: listen for health check on connections
		// TODO: Close sub on connection close
		// TODO: Use a global Redis connection
		// TODO: Add TTL to connections
		// TODO: Maybe use queue for leader instead of pubsub so the P2P is durable
		// TODO: Remove actor from globalState

		// TODO: Add back NX
		// Acquire lease

		// TODO: Do this in 1 round trip with a Lua script

		// Acquire initial information
		const leaseDuration =
			this.#config.actorPeer?.leaseDuration ??
			DEFAULT_ACTOR_PEER_LEASE_DURATION;
		const { initialized, actorTags, leaderNodeId } =
			await this.#p2pDriver.startActorAndAcquireLease(
				this.#actorId,
				this.#globalState.nodeId,
				leaseDuration,
			);
		// Log
		logger().debug("starting actor peer", {
			actorId: this.#actorId,
			initialized,
			leaderNodeId,
		});

		// Validate actor exists
		if (!initialized || !actorTags) {
			throw new Error("Actor does not exist");
		}

		// Parse tags
		this.#actorTags = actorTags;

		// Handle leadership
		this.#leaderNodeId = leaderNodeId;
		if (leaderNodeId === this.#globalState.nodeId) {
			logger().debug("actor peer is leader", {
				actorId: this.#actorId,
				leaderNodeId,
			});

			await this.#convertToLeader();
		} else {
			logger().debug("actor peer is follower", {
				actorId: this.#actorId,
				leaderNodeId,
			});

			this.#leaderNodeId = leaderNodeId;
		}

		// Schedule first heartbeat
		this.#scheduleHeartbeat();
	}

	async #heartbeat() {
		if (this.#isDisposed) return;

		// Execute heartbeat
		if (this.#isLeader) {
			await this.#extendLease();
		} else {
			await this.#attemptAcquireLease();
		}

		this.#scheduleHeartbeat();
	}

	#scheduleHeartbeat() {
		// Schedule next heartbeat (leadership status may have changed)
		let hbTimeout: number;
		if (this.#isLeader) {
			hbTimeout =
				(this.#config.actorPeer?.leaseDuration ??
					DEFAULT_ACTOR_PEER_LEASE_DURATION) -
				(this.#config.actorPeer?.renewLeaseGrace ??
					DEFAULT_ACTOR_PEER_RENEW_LEASE_GRACE);
		} else {
			// TODO: Add jitter
			hbTimeout =
				(this.#config.actorPeer?.checkLeaseInterval ??
					DEFAULT_ACTOR_PEER_CHECK_LEASE_INTERVAL) +
				Math.random() *
					(this.#config.actorPeer?.checkLeaseJitter ??
						DEFAULT_ACTOR_PEER_CHECK_LEASE_JITTER);
		}
		if (hbTimeout < 0)
			throw new Error("Actor peer heartbeat timeout is negative, check config");
		this.#heartbeatTimeout = setTimeout(this.#heartbeat.bind(this), hbTimeout);
	}

	async #convertToLeader() {
		if (!this.#actorTags) throw new Error("missing tags");

		logger().debug("peer acquired leadership", { actorId: this.#actorId });

		// Build actor
		const actorName = this.#actorTags.name;
		const prototype = this.#config.actors[actorName];
		if (!prototype) throw new Error(`no actor for name ${prototype}`);

		// Create leader actor
		const actor = new (prototype as any)() as Actor;
		this.#loadedActor = actor;

		await actor.__start(
			{
				[CONN_DRIVER_P2P_RELAY]: createP2pRelayDriver(this.#globalState, this.#p2pDriver),
			},
			this.#actorDriver,
			this.#actorId,
			this.#actorTags,
			"unknown",
		);
	}

	/**
	 * Extends the lease if the current leader. Called on an interval for leaders leader.
	 *
	 * If the lease has expired for any reason (e.g. connection latency or database purged), this will automatically shut down the actor.
	 */
	async #extendLease() {
		const leaseDuration =
			this.#config.actorPeer?.leaseDuration ??
			DEFAULT_ACTOR_PEER_LEASE_DURATION;
		const { leaseValid } = await this.#p2pDriver.extendLease(
			this.#actorId,
			this.#globalState.nodeId,
			leaseDuration,
		);
		if (leaseValid) {
			logger().debug("lease is valid", { actorId: this.#actorId });
		} else {
			logger().debug("lease is invalid", { actorId: this.#actorId });

			// Shut down. SInce the lease is already lost, no need to clear it.
			await this.#dispose(false);
		}
	}

	/**
	 * Attempts to acquire a lease (aka checks if the leader's lease has expired). Called on an interval for followers.
	 */
	async #attemptAcquireLease() {
		const leaseDuration =
			this.#config.actorPeer?.leaseDuration ??
			DEFAULT_ACTOR_PEER_LEASE_DURATION;
		const { newLeaderNodeId } = await this.#p2pDriver.attemptAcquireLease(
			this.#actorId,
			this.#globalState.nodeId,
			leaseDuration,
		);

		// Check if the lease was successfully acquired and promoted to leader
		const isPromoted =
			!this.#isLeader && newLeaderNodeId === this.#globalState.nodeId;

		// Save leader
		this.#leaderNodeId = newLeaderNodeId;

		// Promote as leader if needed
		if (isPromoted) {
			if (!this.#isLeader) throw new Error("assert: should be promoted");

			this.#convertToLeader();
		}
	}

	async removeConnectionReference(connId: string) {
		const removed = this.#referenceConnections.delete(connId);

		if (removed) {
			logger().debug("removed actor reference", {
				actorId: this.#actorId,
				connId,
				newReferenceCount: this.#referenceConnections.size,
			});
		} else {
			logger().warn("removed reference to actor that didn't exist", {
				actorId: this.#actorId,
				connId,
			});
		}

		if (this.#referenceConnections.size === 0) {
			this.#dispose(true);
		}
	}

	async #dispose(releaseLease: boolean) {
		if (this.#isDisposed) return;
		this.#isDisposed = true;

		logger().info("actor shutting down", { actorId: this.#actorId });

		// IMPORTANT: Do this before anything async
		clearTimeout(this.#heartbeatTimeout);
		this.#globalState.actorPeers.delete(this.#actorId);

		// Stop actor
		//
		// We wait for this to finish to ensure that state is persisted safely to storage
		if (this.#isLeader && this.#loadedActor) {
			await this.#loadedActor.__stop();
		}

		// Clear the lease if needed
		if (this.#isLeader && releaseLease) {
			await this.#p2pDriver.releaseLease(this.#actorId, this.#globalState.nodeId);
		}

		logger().info("actor shutdown success", { actorId: this.#actorId });
	}
}
