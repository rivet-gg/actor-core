import * as path from "node:path";
import { Argument, Command, Option } from "commander";
import { workflow } from "../workflow";
import chokidar from "chokidar";
import { Text } from "ink";
import open from "open";
import { withResolvers } from "../utils/mod";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import dedent from "dedent";
import * as pkg from "../../package.json";

export const dev = new Command()
	.name("dev")
	.description("Run locally your ActorCore project.")
	.addArgument(
		new Argument("[path]", "Location of the app.ts file").default(
			"actors/app.ts",
		),
	)
	.addOption(
		new Option("-r, --root [path]", "Location of the project").default("./"),
	)
	.addOption(
		new Option("--port [port]", "Specify which platform to use").default(
			"6420",
		),
	)
	.addOption(
		new Option("--open", "Open the browser with ActorCore Studio").default(
			true,
		),
	)
	.addOption(
		new Option("--runtime [runtime]", "Specify which platform to use").choices([
			"cloudflare",
		]),
	)
	.option("--no-open", "Do not open the browser with ActorCore Studio")
	.action(action);

export async function action(
	appPath: string,
	opts: {
		root: string;
		port?: string;
		open: boolean;
		runtime?: string;
	},
) {
	const cwd = path.join(process.cwd(), opts.root);

	if (opts.runtime === "cloudflare") {
		console.log("");
		console.log(` 🎭 ActorCore v${pkg.version}`);
		console.log(" Handing over to Wrangler... 👋🏻");
		console.log("");
		await mkdir(path.join(cwd, ".actor-core"), { recursive: true });

		const entry = path.join(cwd, ".actor-core", "cf-entry.js");
		await writeFile(
			entry,
			dedent`
			import { createHandler } from "@actor-core/cloudflare-workers";
			import { app } from "${path.join(cwd, appPath)}";
			app.config.inspector = {
				enabled: true,
			};
			app.config.cors = {
				origin: (origin) => origin,
			};
			const { handler, ActorHandler } = createHandler(app);
			export { handler as default, ActorHandler };
		`,
		);

		spawn("npx", ["wrangler@latest", "dev", "--port", "6240", entry], {
			cwd,
			stdio: "inherit",
		});
		return;
	}

	await workflow(
		`Run locally your ActorCore project (${appPath})`,
		async function* (ctx) {
			if (opts.open) {
				open(
					process.env._ACTOR_CORE_CLI_DEV
						? "http://localhost:43708"
						: "http://studio.rivet.gg",
				);
			}

			const watcher = chokidar.watch(cwd, {
				awaitWriteFinish: true,
				ignoreInitial: true,
				ignored: (path) => path.includes("node_modules"),
			});

			async function createServer() {
				const serverEntry = path.join(
					path.dirname(require.resolve("@actor-core/cli")),
					"server-entry.js",
				);

				return spawn(process.execPath, [serverEntry], {
					env: {
						...process.env,
						PORT: opts.port,
						APP_PATH: appPath,
						RUNTIME: opts.runtime,
					},
					cwd,
					stdio: "overlapped",
				});
			}

			let server: ReturnType<typeof spawn> | undefined = undefined;
			let lock: ReturnType<typeof withResolvers> = withResolvers();

			function createLock() {
				if (lock) {
					lock.resolve(undefined);
				}
				lock = withResolvers();
			}

			watcher.on("all", async (_, path) => {
				if (path.includes("node_modules") || path.includes("/.")) return;

				if (server?.exitCode === 1) {
					// Server exited with error
					console.log("Server exited with error");
					lock.resolve(undefined);
					return;
				} else {
					server?.kill("SIGQUIT");
				}
			});

			createLock();

			while (true) {
				yield* ctx.task(
					"Server started. Watching for changes",
					async function* (ctx) {
						server = await createServer();
						if (server?.stdout) {
							yield ctx.attach(server.stdout, server.stderr);
						}
						createLock();

						server?.addListener("exit", (code) => {
							if (code === 1) {
								ctx.changeLabel(
									"Server exited with error. It will be restarted after next file change...",
								);
								// Server exited with error
								return;
							}
							lock.resolve(undefined);
						});

						await lock.promise;
					},
					{ success: <Text dimColor> (Changes detected, restarting!)</Text> },
				);
			}
		},
	).render();
}
