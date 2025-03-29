import * as path from "node:path";
import { Argument, Command, Option } from "commander";
import { workflow } from "../workflow";

import { $ } from "execa";
import { validateConfigTask } from "../workflows/validate-config";
import { serve } from "@actor-core/nodejs";

export const dev = new Command()
	.name("dev")
	.description("Run locally your ActorCore project.")
	.addArgument(new Argument("[path]", "Location of the project"))
	.addOption(
		new Option("-p, --port [port]", "Specify which platform to use").default(
			"6420",
		),
	)
	.action(action);

export async function action(
	cmdPath = ".",
	opts: {
		port?: string;
	} = {},
) {
	const cwd = path.join(process.cwd(), cmdPath);

	const exec = $({
		cwd,
		env: { ...process.env, npm_config_yes: "true" },
	});
	await workflow("Run locally your ActorCore project", async function* (ctx) {
		const config = yield* ctx.task("Prepare", async function* (ctx) {
			return yield* validateConfigTask(ctx, cwd);
		});

		config.app.config.inspector = {
			enabled: true,
		};

		// const watcher = chokidar.watch(cwd);

		serve(config.app, {
			port: Number.parseInt(opts.port || "6420", 10) || 6420,
		});

		console.log(config.app.config);
	}).render();
}
