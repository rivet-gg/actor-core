import { setupLogging } from "rivetkit/log";
import { serve as honoServe, type ServerType } from "@hono/node-server";
import { createNodeWebSocket, NodeWebSocket } from "@hono/node-ws";
import { logger } from "./log";
import { GetWorkerMeta, RivetManagerDriver } from "./manager-driver";
import type { RivetClientConfig } from "./rivet-client";
import { PartitionTopologyManager } from "rivetkit/topologies/partition";
import { proxy } from "hono/proxy";
import invariant from "invariant";
import { Config } from "./config";
import { WorkerCoreApp } from "rivetkit";

export async function startManager(
	app: WorkerCoreApp<any>,
	driverConfig: Config,
): Promise<void> {
	setupLogging();

	const portStr = process.env.PORT_HTTP;
	if (!portStr) {
		throw "Missing port";
	}
	const port = Number.parseInt(portStr);
	if (!Number.isFinite(port)) {
		throw "Invalid port";
	}

	const endpoint = process.env.RIVET_API_ENDPOINT;
	if (!endpoint) throw new Error("missing RIVET_API_ENDPOINT");
	const token = process.env.RIVET_SERVICE_TOKEN;
	if (!token) throw new Error("missing RIVET_SERVICE_TOKEN");
	const project = process.env.RIVET_PROJECT;
	if (!project) throw new Error("missing RIVET_PROJECT");
	const environment = process.env.RIVET_ENVIRONMENT;
	if (!environment) throw new Error("missing RIVET_ENVIRONMENT");

	const clientConfig: RivetClientConfig = {
		endpoint,
		token,
		project,
		environment,
	};

	//// Force disable inspector
	//driverConfig.app.config.inspector = {
	//	enabled: false,
	//};

	//const corsConfig = driverConfig.app.config.cors;
	//
	//// Enable CORS for Rivet domains
	//driverConfig.app.config.cors = {
	//	...driverConfig.app.config.cors,
	//	origin: (origin, c) => {
	//		const isRivetOrigin =
	//			origin.endsWith(".rivet.gg") || origin.includes("localhost:");
	//		const configOrigin = corsConfig?.origin;
	//
	//		if (isRivetOrigin) {
	//			return origin;
	//		}
	//		if (typeof configOrigin === "function") {
	//			return configOrigin(origin, c);
	//		}
	//		if (typeof configOrigin === "string") {
	//			return configOrigin;
	//		}
	//		return null;
	//	},
	//};

	// Setup manager driver
	if (!driverConfig.drivers) driverConfig.drivers = {};
	if (!driverConfig.drivers.manager) {
		driverConfig.drivers.manager = new RivetManagerDriver(clientConfig);
	}

	// Setup WebSocket routing for Node
	//
	// Save `injectWebSocket` for after server is created
	let injectWebSocket: NodeWebSocket["injectWebSocket"] | undefined;
	if (!driverConfig.getUpgradeWebSocket) {
		driverConfig.getUpgradeWebSocket = (app) => {
			const webSocket = createNodeWebSocket({ app });
			injectWebSocket = webSocket.injectWebSocket;
			return webSocket.upgradeWebSocket;
		};
	}

	// Create manager topology
	driverConfig.topology = driverConfig.topology ?? "partition";
	const managerTopology = new PartitionTopologyManager(
		app.config,
		driverConfig,
		{
			sendRequest: async (workerId, meta, workerRequest) => {
				invariant(meta, "meta not provided");
				const workerMeta = meta as GetWorkerMeta;

				const parsedRequestUrl = new URL(workerRequest.url);
				const workerUrl = `${workerMeta.endpoint}${parsedRequestUrl.pathname}${parsedRequestUrl.search}`;

				logger().debug("proxying request to rivet worker", {
					method: workerRequest.method,
					url: workerUrl,
				});

				const proxyRequest = new Request(workerUrl, workerRequest);
				return await fetch(proxyRequest);
			},
			openWebSocket: async (workerId, meta, encodingKind) => {
				invariant(meta, "meta not provided");
				const workerMeta = meta as GetWorkerMeta;

				// Create WebSocket URL with encoding parameter
				const wsEndpoint = workerMeta.endpoint.replace(/^http/, "ws");
				const url = `${wsEndpoint}/connect/websocket?encoding=${encodingKind}&expose-internal-error=true`;

				logger().debug("opening websocket to worker", {
					workerId,
					url,
				});

				// Open WebSocket connection
				const webSocket = new WebSocket(url);

				// Return the socket when it's open
				return new Promise((resolve, reject) => {
					webSocket.onopen = () => {
						logger().debug("worker websocket connection open", {
							workerId,
						});
						resolve(webSocket);
					};
					webSocket.onerror = (error) => {
						reject(new Error(`WebSocket connection failed: ${error}`));
					};
				});
			},
			proxyRequest: async (c, workerRequest, _workerId, metaRaw) => {
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
			proxyWebSocket: async (c, path, workerId, metaRaw) => {
				invariant(metaRaw, "meta not provided");
				const meta = metaRaw as GetWorkerMeta;

				const workerUrl = `${meta.endpoint}${path}`;

				logger().debug("proxying websocket to rivet worker", {
					url: workerUrl,
				});

				// Create a basic response for now
				// TODO: Implement proper WebSocket forwarding
				return new Response("WebSocket forwarding not fully implemented", {
					status: 501,
				});
			},
		},
	);

	// Start server with ambient env wrapper
	logger().info("server running", { port });
	const server = honoServe({
		fetch: managerTopology.router.fetch,
		hostname: "0.0.0.0",
		port,
	});
	if (!injectWebSocket) throw new Error("injectWebSocket not defined");
	injectWebSocket(server);
}
