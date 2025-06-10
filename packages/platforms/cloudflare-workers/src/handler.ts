import {
	type DurableObjectConstructor,
	type WorkerHandlerInterface,
	createWorkerDurableObject,
} from "./worker-handler-do";
import { ConfigSchema, type InputConfig } from "./config";
import { assertUnreachable } from "rivetkit/utils";
import type { Hono } from "hono";
import { PartitionTopologyManager } from "rivetkit/topologies/partition";
import { logger } from "./log";
import { CloudflareWorkersManagerDriver } from "./manager-driver";
import { WorkerCoreApp } from "rivetkit";
import { upgradeWebSocket } from "./websocket";

/** Cloudflare Workers env */
export interface Bindings {
	WORKER_KV: KVNamespace;
	WORKER_DO: DurableObjectNamespace<WorkerHandlerInterface>;
}

export function createHandler(
	app: WorkerCoreApp<any>,
	inputConfig?: InputConfig,
): {
	handler: ExportedHandler<Bindings>;
	WorkerHandler: DurableObjectConstructor;
} {
	// Create router
	const { router, WorkerHandler } = createRouter(app, inputConfig);

	// Create Cloudflare handler
	const handler = {
		fetch: router.fetch,
	} satisfies ExportedHandler<Bindings>;

	return { handler, WorkerHandler };
}

export function createRouter(
	app: WorkerCoreApp<any>,
	inputConfig?: InputConfig,
): {
	router: Hono<{ Bindings: Bindings }>;
	WorkerHandler: DurableObjectConstructor;
} {
	const driverConfig = ConfigSchema.parse(inputConfig);

	// Configur drivers
	//
	// Worker driver will get set in `WorkerHandler`
	if (!driverConfig.drivers) driverConfig.drivers = {};
	if (!driverConfig.drivers.manager)
		driverConfig.drivers.manager = new CloudflareWorkersManagerDriver();

	// Setup WebSockets
	if (!driverConfig.getUpgradeWebSocket)
		driverConfig.getUpgradeWebSocket = () => upgradeWebSocket;

	// Create Durable Object
	const WorkerHandler = createWorkerDurableObject(app, driverConfig);

	driverConfig.topology = driverConfig.topology ?? "partition";
	if (driverConfig.topology === "partition") {
		const managerTopology = new PartitionTopologyManager(
			app.config,
			driverConfig,
			{
				onProxyRequest: async (c, workerRequest, workerId): Promise<Response> => {
					logger().debug("forwarding request to durable object", {
						workerId,
						method: workerRequest.method,
						url: workerRequest.url,
					});

					const id = c.env.WORKER_DO.idFromString(workerId);
					const stub = c.env.WORKER_DO.get(id);

					return await stub.fetch(workerRequest);
				},
				onProxyWebSocket: async (c, path, workerId) => {
					logger().debug("forwarding websocket to durable object", {
						workerId,
						path,
					});

					// Validate upgrade
					const upgradeHeader = c.req.header("Upgrade");
					if (!upgradeHeader || upgradeHeader !== "websocket") {
						return new Response("Expected Upgrade: websocket", {
							status: 426,
						});
					}

					// Update path on URL
					const newUrl = new URL(`http://worker${path}`);
					const workerRequest = new Request(newUrl, c.req.raw);

					const id = c.env.WORKER_DO.idFromString(workerId);
					const stub = c.env.WORKER_DO.get(id);

					return await stub.fetch(workerRequest);
				},
			},
		);

		// Force the router to have access to the Cloudflare bindings
		const router = managerTopology.router as unknown as Hono<{
			Bindings: Bindings;
		}>;

		return { router, WorkerHandler };
	} else if (
		driverConfig.topology === "standalone" ||
		driverConfig.topology === "coordinate"
	) {
		throw new Error("Cloudflare only supports partition topology.");
	} else {
		assertUnreachable(driverConfig.topology);
	}
}
