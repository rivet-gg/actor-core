import { Argument, Command } from "commander";
import { workflow } from "../workflow";
import { Status } from "../ui/Workflow";
import { pkgFromUserAgent, validateConfig } from "../utils/mod";
import { $, path } from "zx";
import * as fs from "node:fs/promises";
import dedent from "dedent";

export const deploy = new Command()
	.name("deploy")
	.description("Deploy the actor to selected platform.")
	.addArgument(
		new Argument("<platform>", "The platform to deploy to").choices(["rivet"]),
	)
	.addArgument(new Argument("[path]", "Location of the project").default("."))
	.addHelpText(
		"afterAll",
		"\nMissing your favorite platform?\nLet us know! https://github.com/rivet-gg/actor-core/issues/new",
	)
	.action(async (platform, wd) => {
		const cwd = path.join(process.cwd(), wd);
		const $$ = $({
			cwd,
			stdio: "inherit",
			quiet: true,
			nothrow: true,
			env: { ...process.env, NO_COLOR: "1" },
		});

		await workflow("Deploy actors to Rivet", async function* (ctx) {
			const config = yield* ctx.task("Validate config", async () => {
				try {
					return await validateConfig(cwd);
				} catch (error) {
					throw ctx.error("Could not find proper configuration.", {
						hint: "Make sure you're running this command in the correct directory with valid actorcore's config.",
					});
				}
			});

			const pkgInfo = yield* ctx.task("Determine package manager", async () => {
				const pkg = pkgFromUserAgent(process.env.npm_config_user_agent);
				if (pkg?.name === "yarn") {
					return { manager: "yarn", command: "yarn dlx" };
				}
				if (pkg?.name === "pnpm") {
					return { manager: "pnpm", command: "pnpx" };
				}
				return { manager: "npm", command: "npx" };
			});

			yield* ctx.task("Deploy Actor Manager to Rivet", async function* (ctx) {
				yield fs.mkdir(path.join(cwd, ".actorcore"), {
					recursive: true,
				});

				const entrypoint = path.join(cwd, ".actorcore", "manager.js");
				yield fs.writeFile(
					entrypoint,
					dedent`
					import { createManagerHandler } from "@actor-core/rivet";
					export default createManagerHandler();
				`,
				);

				const relative = path.relative(cwd, entrypoint);

				yield* ctx.task(
					`Run \`${pkgInfo.command} rivet-cli publish manager ${relative}\``,
					async (ctx) => {
						ctx.suspend();
						// at this point Ferris the Rustacean took over our precious terminal
						const output =
							await $$`${pkgInfo.command} rivet-cli publish manager ${entrypoint}`;
						if (output.exitCode !== 0) {
							throw ctx.error("Failed to deploy actors.", {
								hint: "Check the logs above for more information.",
							});
						}
					},
				);
			});

			for (const [actorName, actorPath] of Object.entries(config.actors)) {
				yield* ctx.task(
					`Deploy "${actorName}" (${actorPath}) to Rivet`,
					async function* (ctx) {
						const entrypoint = yield* ctx.task(
							`Create entrypoint for ${actorName}`,
							function* () {
								yield fs.mkdir(path.join(cwd, ".actorcore"), {
									recursive: true,
								});

								const entrypoint = path.join(
									cwd,
									".actorcore",
									`entrypoint-${actorName}.js`,
								);
								yield fs.writeFile(
									entrypoint,
									dedent`
									import { createHandler } from "@actor-core/rivet";
									import Actor from "../${actorPath}";
									import config from "../actorcore.config.ts";
									export default createHandler(Actor, config);
								`,
								);

								return entrypoint;
							},
						);

						yield* ctx.task(
							`Run \`${pkgInfo.command} rivet-cli publish ${actorName} ${actorPath}\``,
							async function* (ctx) {
								ctx.suspend();
								const output =
									await $$`${pkgInfo.command} rivet-cli publish --access=public ${actorName} ${entrypoint}`;

								if (output.exitCode !== 0) {
									throw ctx.error("Failed to deploy actors.", {
										hint: "Check the logs above for more information.",
									});
								}
								yield ctx.render(
									<Status value="done">Actors deployed successfully!</Status>,
								);
							},
						);
					},
				);
			}
		}).render();
	});
