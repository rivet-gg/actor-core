import { setupLogging } from "rivetkit/log";
import { stringifyError } from "rivetkit/utils";
import type { WorkerContext } from "@rivet-gg/worker-core";
import { upgradeWebSocket } from "hono/deno";
import { logger } from "./log";
import type { RivetHandler } from "./util";
import { deserializeKeyFromTag } from "./util";
import { PartitionTopologyWorker } from "rivetkit/topologies/partition";
import { ConfigSchema, type InputConfig } from "./config";
import { RivetWorkerDriver } from "./worker-driver";
import { rivetRequest } from "./rivet-client";
import invariant from "invariant";

export function createWorkerHandler(inputConfig: InputConfig): RivetHandler {
	try {
		return createWorkerHandlerInner(inputConfig);
	} catch (error) {
		logger().error("failed to start worker", { error: stringifyError(error) });
		Deno.exit(1);
	}
}

function createWorkerHandlerInner(inputConfig: InputConfig): RivetHandler {
	const driverConfig = ConfigSchema.parse(inputConfig);

	const handler = {
		async start(ctx: WorkerContext): Promise<void> {
			setupLogging();

			const portStr = Deno.env.get("PORT_HTTP");
			if (!portStr) {
				throw "Missing port";
			}
			const port = Number.parseInt(portStr);
			if (!Number.isFinite(port)) {
				throw "Invalid port";
			}

			const endpoint = Deno.env.get("RIVET_API_ENDPOINT");
			if (!endpoint) throw new Error("missing RIVET_API_ENDPOINT");

			// Initialization promise
			const initializedPromise = Promise.withResolvers<void>();
			if ((await ctx.kv.get(["rivetkit", "initialized"])) === true) {
				initializedPromise.resolve(undefined);
			}

			// Setup worker driver
			if (!driverConfig.drivers) driverConfig.drivers = {};
			if (!driverConfig.drivers.worker) {
				driverConfig.drivers.worker = new RivetWorkerDriver(ctx);
			}

			// Setup WebSocket upgrader
			if (!driverConfig.getUpgradeWebSocket) {
				driverConfig.getUpgradeWebSocket = () => upgradeWebSocket;
			}

			driverConfig.app.config.inspector = {
				enabled: true,
				onRequest: async (c) => {
					const url = new URL(c.req.url);
					const token = url.searchParams.get("token");

					if (!token) {
						return false;
					}

					try {
						const response = await rivetRequest<void, { agent: unknown }>(
							{ endpoint, token },
							"GET",
							"/cloud/auth/inspect",
						);
						return "agent" in response;
					} catch (e) {
						return false;
					}
				},
			};

			const corsConfig = driverConfig.app.config.cors;

			// Enable CORS for Rivet domains
			driverConfig.app.config.cors = {
				...driverConfig.app.config.cors,
				origin: (origin, c) => {
					const isRivetOrigin =
						origin.endsWith(".rivet.gg") || origin.includes("localhost:");
					const configOrigin = corsConfig?.origin;

					if (isRivetOrigin) {
						return origin;
					}
					if (typeof configOrigin === "function") {
						return configOrigin(origin, c);
					}
					if (typeof configOrigin === "string") {
						return configOrigin;
					}
					return null;
				},
			};

			// Create worker topology
			driverConfig.topology = driverConfig.topology ?? "partition";
			const workerTopology = new PartitionTopologyWorker(
				driverConfig.app.config,
				driverConfig,
			);

			// Set a catch-all route
			const router = workerTopology.router;

			// TODO: This needs to be secured
			// TODO: This needs to assert this has only been called once
			// Initialize with data
			router.post("/initialize", async (c) => {
				const body = await c.req.json();

				logger().debug("received initialize request", {
					hasInput: !!body.input,
				});

				// Write input
				if (body.input) {
					await ctx.kv.putBatch(
						new Map([
							[["rivetkit", "input", "exists"], true],
							[["rivetkit", "input", "data"], body.input],
						]),
					);
				}

				// Finish initialization
				initializedPromise.resolve(undefined);

				return c.json({}, 200);
			});

			// Start server
			logger().info("server running", { port });
			const server = Deno.serve(
				{
					port,
					hostname: "0.0.0.0",
					// Remove "Listening on ..." message
					onListen() {},
				},
				router.fetch,
			);

			// Assert name exists
			if (!("name" in ctx.metadata.worker.tags)) {
				throw new Error(
					`Tags for worker ${ctx.metadata.worker.id} do not contain property name: ${JSON.stringify(ctx.metadata.worker.tags)}`,
				);
			}

			// Extract key from Rivet's tag format
			const key = extractKeyFromRivetTags(ctx.metadata.worker.tags);

			// Start worker after initialized
			await initializedPromise.promise;
			await workerTopology.start(
				ctx.metadata.worker.id,
				ctx.metadata.worker.tags.name,
				key,
				ctx.metadata.region.id,
			);

			// Wait for server
			await server.finished;
		},
	} satisfies RivetHandler;

	return handler;
}

// Helper function to extract key array from Rivet's tag format
function extractKeyFromRivetTags(tags: Record<string, string>): string[] {
	invariant(typeof tags.key === "string", "key tag does not exist");
	return deserializeKeyFromTag(tags.key);
}
