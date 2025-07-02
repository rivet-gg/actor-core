import type { ActorDriver } from "@/actor/driver";
import type { ManagerDriver } from "@/manager/driver";
import type { CoordinateDriver } from "@/topologies/coordinate/driver";
import type { UpgradeWebSocket } from "@/utils";
import { createDefaultDriver } from "@/drivers/default";
import type { cors } from "hono/cors";
import { z } from "zod";
import { InspectorConfigSchema } from "@/inspector/config";

type CorsOptions = NonNullable<Parameters<typeof cors>[0]>;

export const ActorPeerConfigSchema = z.object({
	/**
	 * How long the actor leader holds a lease for.
	 *
	 * Milliseconds
	 **/
	leaseDuration: z.number().optional().default(3000),
	/**
	 * How long before the lease will expire to issue the renew command.
	 *
	 * Milliseconds
	 */
	renewLeaseGrace: z.number().optional().default(1500),
	/**
	 * How frequently the followers check if the leader is still active.
	 *
	 * Milliseconds
	 */
	checkLeaseInterval: z.number().optional().default(1000),
	/**
	 * Positive jitter for check lease interval
	 *
	 * Milliseconds
	 */
	checkLeaseJitter: z.number().optional().default(500),
	/**
	 * How long to wait for a message ack.
	 *
	 * Milliseconds
	 */
	messageAckTimeout: z.number().optional().default(1000),
});
export type ActorPeerConfig = z.infer<typeof ActorPeerConfigSchema>;

export const TopologySchema = z.enum(["standalone", "partition", "coordinate"]);
export type Topology = z.infer<typeof TopologySchema>;

export type GetUpgradeWebSocket = () => UpgradeWebSocket;

export const DriverConfigSchema = z.object({
	topology: TopologySchema,
	manager: z.custom<ManagerDriver>(),
	actor: z.custom<ActorDriver>(),
	coordinate: z.custom<CoordinateDriver>().optional(),
});

export type DriverConfig = z.infer<typeof DriverConfigSchema>;

/** Base config used for the actor config across all platforms. */
export const RunConfigSchema = z
	.object({
		driver: DriverConfigSchema.optional().default(() => createDefaultDriver()),

		// This is a function to allow for lazy configuration of upgradeWebSocket on the
		// fly. This is required since the dependencies that profie upgradeWebSocket
		// (specifically Node.js) can sometimes only be specified after the router is
		// created or must be imported async using `await import(...)`
		getUpgradeWebSocket: z.custom<GetUpgradeWebSocket>().optional(),

		/** CORS configuration for the router. Uses Hono's CORS middleware options. */
		cors: z.custom<CorsOptions>().optional(),

		maxIncomingMessageSize: z.number().optional().default(65_536),

		/** Peer configuration for coordinated topology. */
		actorPeer: ActorPeerConfigSchema.optional().default({}),
	})
	.default({});

export type RunConfig = z.infer<typeof RunConfigSchema>;
export type RunConfigInput = z.input<typeof RunConfigSchema>;
