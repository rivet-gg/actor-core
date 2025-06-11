import { Hono, type Context as HonoContext } from "hono";
import { logger } from "./log";
import { cors } from "hono/cors";
import {
	handleRouteError,
	handleRouteNotFound,
	loggerMiddleware,
} from "@/common/router";
import type { DriverConfig } from "@/driver-helpers/config";
import type { AppConfig } from "@/app/config";
import {
	type WorkerInspectorConnHandler,
	createWorkerInspectorRouter,
} from "@/inspector/worker";
import {
	type ConnectWebSocketOpts,
	type ConnectWebSocketOutput,
	type ConnectSseOpts,
	type ConnectSseOutput,
	type ActionOpts,
	type ActionOutput,
	type ConnsMessageOpts,
	type ConnectionHandlers,
	handleWebSocketConnect,
	handleSseConnect,
	handleAction,
	handleConnectionMessage,
	HEADER_CONN_TOKEN,
	HEADER_CONN_ID,
	ALL_HEADERS,
} from "@/worker/router-endpoints";

export type {
	ConnectWebSocketOpts,
	ConnectWebSocketOutput,
	ConnectSseOpts,
	ConnectSseOutput,
	ActionOpts,
	ActionOutput,
	ConnsMessageOpts,
};

export interface WorkerRouterHandler {
	getWorkerId: () => Promise<string>;

	// Connection handlers as a required subobject
	connectionHandlers: ConnectionHandlers;

	onConnectInspector?: WorkerInspectorConnHandler;
}

/**
 * Creates a router that runs on the partitioned instance.
 */
export function createWorkerRouter(
	appConfig: AppConfig,
	driverConfig: DriverConfig,
	handler: WorkerRouterHandler,
): Hono {
	const app = new Hono();

	const upgradeWebSocket = driverConfig.getUpgradeWebSocket?.(app);

	app.use("*", loggerMiddleware(logger()));

	// Apply CORS middleware if configured
	//
	//This is only relevant if the worker is exposed directly publicly
	if (appConfig.cors) {
		const corsConfig = appConfig.cors;

		app.use("*", async (c, next) => {
			const path = c.req.path;

			// Don't apply to WebSocket routes, see https://hono.dev/docs/helpers/websocket#upgradewebsocket
			if (path === "/connect/websocket" || path === "/inspect") {
				return next();
			}

			return cors({
				...corsConfig,
				allowHeaders: [...(appConfig.cors?.allowHeaders ?? []), ...ALL_HEADERS],
			})(c, next);
		});
	}

	app.get("/", (c) => {
		return c.text(
			"This is an WorkerCore server.\n\nLearn more at https://workercore.org",
		);
	});

	app.get("/health", (c) => {
		return c.text("ok");
	});

	// Use the handlers from connectionHandlers
	const handlers = handler.connectionHandlers;

	if (upgradeWebSocket && handlers.onConnectWebSocket) {
		app.get(
			"/connect/websocket",
			upgradeWebSocket(async (c) => {
				const workerId = await handler.getWorkerId();
				return handleWebSocketConnect(
					c as HonoContext,
					appConfig,
					driverConfig,
					handlers.onConnectWebSocket!,
					workerId,
				)();
			}),
		);
	} else {
		app.get("/connect/websocket", (c) => {
			return c.text(
				"WebSockets are not enabled for this driver. Use SSE instead.",
				400,
			);
		});
	}

	app.get("/connect/sse", async (c) => {
		if (!handlers.onConnectSse) {
			throw new Error("onConnectSse handler is required");
		}
		const workerId = await handler.getWorkerId();
		return handleSseConnect(
			c,
			appConfig,
			driverConfig,
			handlers.onConnectSse,
			workerId,
		);
	});

	app.post("/action/:action", async (c) => {
		if (!handlers.onAction) {
			throw new Error("onAction handler is required");
		}
		const actionName = c.req.param("action");
		const workerId = await handler.getWorkerId();
		return handleAction(
			c,
			appConfig,
			driverConfig,
			handlers.onAction,
			actionName,
			workerId,
		);
	});

	app.post("/connections/message", async (c) => {
		if (!handlers.onConnMessage) {
			throw new Error("onConnMessage handler is required");
		}
		const connId = c.req.header(HEADER_CONN_ID);
		const connToken = c.req.header(HEADER_CONN_TOKEN);
		const workerId = await handler.getWorkerId();
		if (!connId || !connToken) {
			throw new Error("Missing required parameters");
		}
		return handleConnectionMessage(
			c,
			appConfig,
			handlers.onConnMessage,
			connId,
			connToken,
			workerId,
		);
	});

	if (appConfig.inspector.enabled) {
		app.route(
			"/inspect",
			createWorkerInspectorRouter(
				upgradeWebSocket,
				handler.onConnectInspector,
				appConfig.inspector,
			),
		);
	}

	app.notFound(handleRouteNotFound);
	app.onError(
		handleRouteError.bind(undefined, {
			// All headers to this endpoint are considered secure, so we can enable the expose internal error header for requests from the internal client
			enableExposeInternalError: true,
		}),
	);

	return app;
}
