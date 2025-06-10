import { setupLogging } from "rivetkit/log";
import { stringifyError } from "rivetkit/utils";
import type { WorkerContext } from "@rivet-gg/worker-core";
import { logger } from "./log";
import { GetWorkerMeta, RivetManagerDriver } from "./manager-driver";
import type { RivetClientConfig } from "./rivet-client";
import type { RivetHandler } from "./util";
import { createWebSocketProxy } from "./ws-proxy";
import { PartitionTopologyManager } from "rivetkit/topologies/partition";
import { type InputConfig, ConfigSchema } from "./config";
import { proxy } from "hono/proxy";
import invariant from "invariant";
import { upgradeWebSocket } from "hono/deno";

export function createManagerHandler(inputConfig: InputConfig): RivetHandler {
	try {
		return createManagerHandlerInner(inputConfig);
	} catch (error) {
		logger().error("failed to start manager", { error: stringifyError(error) });
		Deno.exit(1);
	}
}

export function createManagerHandlerInner(
	inputConfig: InputConfig,
): RivetHandler {
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
			const token = Deno.env.get("RIVET_SERVICE_TOKEN");
			if (!token) throw new Error("missing RIVET_SERVICE_TOKEN");

			const clientConfig: RivetClientConfig = {
				endpoint,
				token,
				project: ctx.metadata.project.slug,
				environment: ctx.metadata.environment.slug,
			};

			// Force disable inspector
			driverConfig.app.config.inspector = {
				enabled: false,
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

			// Setup manager driver
			if (!driverConfig.drivers) driverConfig.drivers = {};
			if (!driverConfig.drivers.manager) {
				driverConfig.drivers.manager = new RivetManagerDriver(clientConfig);
			}

			// Setup WebSocket upgrader
			if (!driverConfig.getUpgradeWebSocket) {
				driverConfig.getUpgradeWebSocket = () => upgradeWebSocket;
			}

			// Create manager topology
			driverConfig.topology = driverConfig.topology ?? "partition";
			const managerTopology = new PartitionTopologyManager(
				driverConfig.app.config,
				driverConfig,
				{
					onProxyRequest: async (c, workerRequest, _workerId, metaRaw) => {
						invariant(metaRaw, "meta not provided");
						const meta = metaRaw as GetWorkerMeta;

						const parsedRequestUrl = new URL(workerRequest.url);
						const workerUrl = `${meta.endpoint}${parsedRequestUrl.pathname}${parsedRequestUrl.search}`;

						logger().debug("proxying request to rivet worker", {
							method: workerRequest.method,
							url: workerUrl,
						});

						const proxyRequest = new Request(workerUrl, workerRequest);
						return await proxy(proxyRequest);
					},
					onProxyWebSocket: async (c, path, workerId, metaRaw) => {
						invariant(metaRaw, "meta not provided");
						const meta = metaRaw as GetWorkerMeta;

						const workerUrl = `${meta.endpoint}${path}`;

						logger().debug("proxying websocket to rivet worker", {
							url: workerUrl,
						});

						// TODO: fix as any
						return createWebSocketProxy(c, workerUrl) as any;
					},
				},
			);

			const app = managerTopology.router;

			logger().info("server running", { port });
			const server = Deno.serve(
				{
					port,
					hostname: "0.0.0.0",
					// Remove "Listening on ..." message
					onListen() {},
				},
				app.fetch,
			);
			await server.finished;
		},
	} satisfies RivetHandler;

	return handler;
}
