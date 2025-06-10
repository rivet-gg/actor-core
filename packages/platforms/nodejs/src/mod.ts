import { serve as honoServe, type ServerType } from "@hono/node-server";
import { createNodeWebSocket, type NodeWebSocket } from "@hono/node-ws";
import { assertUnreachable } from "rivetkit/utils";
import { CoordinateTopology } from "rivetkit/topologies/coordinate";
import { logger } from "./log";
import type { Hono } from "hono";
import { StandaloneTopology, type WorkerCoreApp } from "rivetkit";
import {
	MemoryGlobalState,
	MemoryManagerDriver,
	MemoryWorkerDriver,
} from "@rivetkit/memory";
import { type InputConfig, ConfigSchema } from "./config";
import {
	FileSystemWorkerDriver,
	FileSystemGlobalState,
	FileSystemManagerDriver,
} from "@rivetkit/file-system";

export { InputConfig as Config } from "./config";

export function createRouter(
	app: WorkerCoreApp<any>,
	inputConfig?: InputConfig,
): {
	router: Hono;
	injectWebSocket: NodeWebSocket["injectWebSocket"];
} {
	const config = ConfigSchema.parse(inputConfig);

	// Configure default configuration
	if (!config.topology) config.topology = "standalone";
	if (!config.drivers.manager || !config.drivers.worker) {
		if (config.mode === "file-system") {
			const fsState = new FileSystemGlobalState();
			if (!config.drivers.manager) {
				config.drivers.manager = new FileSystemManagerDriver(app, fsState);
			}
			if (!config.drivers.worker) {
				config.drivers.worker = new FileSystemWorkerDriver(fsState);
			}
		} else if (config.mode === "memory") {
			const memoryState = new MemoryGlobalState();
			if (!config.drivers.manager) {
				config.drivers.manager = new MemoryManagerDriver(app, memoryState);
			}
			if (!config.drivers.worker) {
				config.drivers.worker = new MemoryWorkerDriver(memoryState);
			}
		} else {
			assertUnreachable(config.mode);
		}
	}

	// Setup WebSocket routing for Node
	//
	// Save `injectWebSocket` for after server is created
	let injectWebSocket: NodeWebSocket["injectWebSocket"] | undefined;
	if (!config.getUpgradeWebSocket) {
		config.getUpgradeWebSocket = (app) => {
			const webSocket = createNodeWebSocket({ app });
			injectWebSocket = webSocket.injectWebSocket;
			return webSocket.upgradeWebSocket;
		};
	}

	// Setup topology
	if (config.topology === "standalone") {
		const topology = new StandaloneTopology(app.config, config);
		if (!injectWebSocket) throw new Error("injectWebSocket not defined");
		return { router: topology.router, injectWebSocket };
	} else if (config.topology === "partition") {
		throw new Error("Node.js only supports standalone & coordinate topology.");
	} else if (config.topology === "coordinate") {
		const topology = new CoordinateTopology(app.config, config);
		if (!injectWebSocket) throw new Error("injectWebSocket not defined");
		return { router: topology.router, injectWebSocket };
	} else {
		assertUnreachable(config.topology);
	}
}

export function serve(
	app: WorkerCoreApp<any>,
	inputConfig?: InputConfig,
): ServerType {
	const config = ConfigSchema.parse(inputConfig);

	const { router, injectWebSocket } = createRouter(app, config);

	const server = honoServe({
		fetch: router.fetch,
		hostname: config.hostname,
		port: config.port,
	});
	injectWebSocket(server);

	logger().info("workercore started", {
		hostname: config.hostname,
		port: config.port,
	});

	return server;
}
