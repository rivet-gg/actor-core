import { createManagerRouter } from "@/manager/router";
import { AppConfig, AppConfigSchema, setup } from "@/mod";
import { ConnectionHandlers } from "@/worker/router-endpoints";
import { DriverConfig } from "@/driver-helpers/config";
import {
	TestGlobalState,
	TestWorkerDriver,
	TestManagerDriver,
} from "@/test/driver/mod";
import { OpenAPIHono } from "@hono/zod-openapi";
import { VERSION } from "@/utils";
import * as fs from "node:fs/promises";
import { resolve } from "node:path";

function main() {
	const appConfig: AppConfig = AppConfigSchema.parse({ workers: {} });
	const app = setup(appConfig);

	const memoryState = new TestGlobalState();
	const driverConfig: DriverConfig = {
		drivers: {
			worker: new TestWorkerDriver(memoryState),
			manager: new TestManagerDriver(app, memoryState),
		},
		getUpgradeWebSocket: () => () => unimplemented(),
	};

	const sharedConnectionHandlers: ConnectionHandlers = {
		onConnectWebSocket: async () => {
			unimplemented();
		},
		onConnectSse: async (opts) => {
			unimplemented();
		},
		onAction: async (opts) => {
			unimplemented();
		},
		onConnMessage: async (opts) => {
			unimplemented();
		},
	};

	const managerRouter = createManagerRouter(appConfig, driverConfig, {
		routingHandler: {
			inline: {
				handlers: sharedConnectionHandlers,
			},
		},
	}) as unknown as OpenAPIHono;

	const openApiDoc = managerRouter.getOpenAPIDocument({
		openapi: "3.0.0",
		info: {
			version: VERSION,
			title: "WorkerCore API",
		},
	});

	const outputPath = resolve(
		import.meta.dirname,
		"..",
		"..",
		"..",
		"docs",
		"openapi.json",
	);
	fs.writeFile(outputPath, JSON.stringify(openApiDoc, null, 2));
	console.log("Dumped OpenAPI to", outputPath);
}

function unimplemented(): never {
	throw new Error("UNIMPLEMENTED");
}

main();
