import { ActorContext } from "@rivet-gg/actor-core";
import { Config } from "./config";
import { logger } from "./log";
import { stringifyError } from "rivetkit/utils";
import { ConfigSchema, type InputConfig } from "./config";
import { startManager } from "./manager";
import { startWorker } from "./worker";
import type { RivetHandler } from "./util";
import { WorkerCoreApp } from "rivetkit";

export function createHandler(
	app: WorkerCoreApp<any>,
	inputConfig: InputConfig,
): RivetHandler {
	// This works as a hybrid handler between the isolate runtime & the Node runtime.
	//
	// Current hack:
	// - Manager must be ran as an HTTP server, meaning it must use Node
	// - Workers must be ran as isolates, meaning it must use Deno
	//
	// If it detects a main function, it will start the manager.

	let driverConfig: Config;
	try {
		driverConfig = ConfigSchema.parse(inputConfig);
	} catch (error) {
		logger().error("failed to start manager", { error: stringifyError(error) });
		universalExit(1);
	}

	if (require.main === module) {
		// Assumed running in the container with Node

		startManager(app, driverConfig);

		return {
			start(_ctx) {
				throw new Error(
					"This file was detected as the main Node.js entrypoint. `start` handler should not be called.",
				);
			},
		};
	} else {
		// Assumed running in the isolate runtime with Deno

		return {
			async start(ctx: ActorContext) {
				const role = ctx.metadata.actor.tags.role;
				if (role === "worker") {
					await startWorker(ctx, app, driverConfig);
				} else if (role === "manager") {
					throw new Error("Cannot run manager in the isolate runtime.");
				} else {
					throw new Error(`Unknown role (must be worker or manager): ${role}`);
				}
			},
		};
	}
}

function universalExit(code: number): never {
	if (typeof Deno === "object") {
		Deno.exit(code);
	} else if (typeof process === "object") {
		process.exit(1);
	} else {
		throw new Error("Could not find exit function");
	}
}
