import * as errors from "@/worker/errors";
import * as protoHttpAction from "@/worker/protocol/http/action";
import { logger } from "./log";
import type { EventSource } from "eventsource";
import type * as wsToServer from "@/worker/protocol/message/to-server";
import { type Encoding, serialize } from "@/worker/protocol/serde";
import {
	HEADER_CONN_PARAMS,
	HEADER_ENCODING,
	type ConnectionHandlers,
} from "@/worker/router-endpoints";
import { HonoRequest, type Context as HonoContext, type Next } from "hono";
import invariant from "invariant";
import { ClientDriver } from "@/client/client";
import { ManagerDriver } from "@/manager/driver";
import { WorkerQuery } from "@/manager/protocol/query";
import { ConnRoutingHandler } from "@/worker/conn-routing-handler";
import { sendHttpRequest, serializeWithEncoding } from "@/client/utils";
import { ActionRequest, ActionResponse } from "@/worker/protocol/http/action";
import { assertUnreachable } from "@/worker/utils";

/**
 * Client driver that calls the manager driver inline.
 *
 * This driver can access private resources.
 *
 * This driver serves a double purpose as:
 * - Providing the client for the internal requests
 * - Provide the driver for the manager HTTP router (see manager/router.ts)
 */
export function createInlineClientDriver(
	managerDriver: ManagerDriver,
	routingHandler: ConnRoutingHandler,
): ClientDriver {
	//// Lazily import the dynamic imports so we don't have to turn `createClient` in to an aysnc fn
	//const dynamicImports = (async () => {
	//	// Import dynamic dependencies
	//	const [WebSocket, EventSource] = await Promise.all([
	//		importWebSocket(),
	//		importEventSource(),
	//	]);
	//	return {
	//		WebSocket,
	//		EventSource,
	//	};
	//})();

	const driver: ClientDriver = {
		action: async <Args extends Array<unknown> = unknown[], Response = unknown>(
			req: HonoRequest | undefined,
			workerQuery: WorkerQuery,
			encoding: Encoding,
			params: unknown,
			actionName: string,
			...args: Args
		): Promise<Response> => {
			// Get the worker ID and meta
			const { workerId, meta } = await queryWorker(
				req,
				workerQuery,
				managerDriver,
			);
			logger().debug("found worker for action", { workerId, meta });
			invariant(workerId, "Missing worker ID");

			// Invoke the action
			logger().debug("handling action", { actionName, encoding });
			if ("inline" in routingHandler) {
				const { output } = await routingHandler.inline.handlers.onAction({
					req,
					params,
					actionName,
					actionArgs: args,
					workerId,
				});
				return output as Response;
			} else if ("custom" in routingHandler) {
				const responseData = await sendHttpRequest<
					ActionRequest,
					ActionResponse
				>({
					url: `http://worker/action/${encodeURIComponent(actionName)}`,
					method: "POST",
					headers: {
						[HEADER_ENCODING]: encoding,
						...(params !== undefined
							? { [HEADER_CONN_PARAMS]: JSON.stringify(params) }
							: {}),
					},
					body: { a: args } satisfies ActionRequest,
					encoding: encoding,
					customFetch: routingHandler.custom.sendRequest.bind(
						undefined,
						workerId,
						meta,
					),
				});

				return responseData.o as Response;
			} else {
				assertUnreachable(routingHandler);
			}
		},

		resolveWorkerId: async (
			req: HonoRequest | undefined,
			workerQuery: WorkerQuery,
			_encodingKind: Encoding,
		): Promise<string> => {
			// Get the worker ID and meta
			const { workerId } = await queryWorker(req, workerQuery, managerDriver);
			logger().debug("resolved worker", { workerId });
			invariant(workerId, "missing worker ID");

			return workerId;
		},

		connectWebSocket: async (
			req: HonoRequest | undefined,
			workerQuery: WorkerQuery,
			encodingKind: Encoding,
		): Promise<WebSocket> => {
			throw "UNIMPLEMENTED";
		},

		connectSse: async (
			req: HonoRequest | undefined,
			workerQuery: WorkerQuery,
			encodingKind: Encoding,
			params: unknown,
		): Promise<EventSource> => {
			throw "UNIMPLEMENTED";
		},

		sendHttpMessage: async (
			req: HonoRequest | undefined,
			workerId: string,
			encoding: Encoding,
			connectionId: string,
			connectionToken: string,
			message: wsToServer.ToServer,
		): Promise<Response> => {
			throw "UNIMPLEMENTED";
		},
	};

	return driver;
}

/**
 * Query the manager driver to get or create a worker based on the provided query
 */
export async function queryWorker(
	req: HonoRequest | undefined,
	query: WorkerQuery,
	driver: ManagerDriver,
): Promise<{ workerId: string; meta?: unknown }> {
	logger().debug("querying worker", { query });
	let workerOutput: { workerId: string; meta?: unknown };
	if ("getForId" in query) {
		const output = await driver.getForId({
			req,
			workerId: query.getForId.workerId,
		});
		if (!output) throw new errors.WorkerNotFound(query.getForId.workerId);
		workerOutput = output;
	} else if ("getForKey" in query) {
		const existingWorker = await driver.getWithKey({
			req,
			name: query.getForKey.name,
			key: query.getForKey.key,
		});
		if (!existingWorker) {
			throw new errors.WorkerNotFound(
				`${query.getForKey.name}:${JSON.stringify(query.getForKey.key)}`,
			);
		}
		workerOutput = existingWorker;
	} else if ("getOrCreateForKey" in query) {
		const getOrCreateOutput = await driver.getOrCreateWithKey({
			req,
			name: query.getOrCreateForKey.name,
			key: query.getOrCreateForKey.key,
			input: query.getOrCreateForKey.input,
			region: query.getOrCreateForKey.region,
		});
		workerOutput = {
			workerId: getOrCreateOutput.workerId,
			meta: getOrCreateOutput.meta,
		};
	} else if ("create" in query) {
		const createOutput = await driver.createWorker({
			req,
			name: query.create.name,
			key: query.create.key,
			input: query.create.input,
			region: query.create.region,
		});
		workerOutput = {
			workerId: createOutput.workerId,
			meta: createOutput.meta,
		};
	} else {
		throw new errors.InvalidRequest("Invalid query format");
	}

	logger().debug("worker query result", {
		workerId: workerOutput.workerId,
		meta: workerOutput.meta,
	});
	return { workerId: workerOutput.workerId, meta: workerOutput.meta };
}
