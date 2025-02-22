import * as fs from "node:fs/promises";
import path from "node:path";
import { Argument, Command, Option } from "commander";
import dedent from "dedent";
import { $ } from "execa";
import { Box, Text } from "ink";
import semver from "semver";
import which from "which";
import { MIN_RIVET_CLI_VERSION } from "../constants";
import { VERSION } from "../macros" with { type: "macro" };
import {
	type Platform,
	resolvePlatformSpecificOptions,
	validateConfig,
} from "../utils/mod";
import { workflow } from "../workflow";

export const deploy = new Command()
	.name("deploy")
	.description("Deploy the actor to selected platform.")
	.addArgument(
		new Argument("<platform>", "The platform to deploy to").choices(["rivet"]),
	)
	.addArgument(new Argument("[path]", "Location of the project").default("./"))
	.addOption(new Option("-v [version]", "Specify version of actor-core"))
	.addHelpText(
		"afterAll",
		"\nMissing your favorite platform?\nLet us know! https://github.com/rivet-gg/actor-core/issues/new",
	)
	.action(async (platform, wd, opts) => {
		const cwd = path.join(process.cwd(), wd);

		await workflow("Deploy actors to Rivet", async function* (ctx) {
			const { config, cli } = yield* ctx.task("Prepare", async function* (ctx) {
				const config = yield* ctx.task("Validate config", async () => {
					try {
						return await validateConfig(cwd);
					} catch (error) {
						throw ctx.error("Could not configuration file.", {
							hint: "Make sure you're running this command in the directory with actor-core.config.js file.",
						});
					}
				});

				const platformOptions = yield* ctx.task(
					"Resolve platform specific files",
					async () => {
						return resolvePlatformSpecificOptions(platform as Platform, {
							files: {},
							version: opts.version || VERSION,
						});
					},
				);

				const cli = yield* ctx.task("Locale rivet-cli", async function* (ctx) {
					let cmd = await which("rivet-cli", { nothrow: true });

					if (!cmd) {
						cmd = await which("rivet", { nothrow: true });
					}

					if (process.env.RIVET_CLI_PATH) {
						cmd = process.env.RIVET_CLI_PATH;
					}

					if (cmd) {
						// check version
						const { stdout } = yield* ctx.$`${cmd} --version`;
						const semVersion = semver.coerce(
							stdout.split("\n")[2].split(" ")[1].trim(),
						);

						if (semVersion) {
							if (semver.gte(semVersion, MIN_RIVET_CLI_VERSION)) {
								return cmd;
							}
						}
					}

					return `${platformOptions.cmds.exec} rivet-cli@latest`;
				});

				return { config, cli };
			});

			yield* ctx.task("Auth to Rivet", async function* (ctx) {
				const isLogged = yield* ctx.task(
					"Check if logged in",
					async function* (ctx) {
						const output = yield* ctx.$`${cli} metadata auth-status`;
						return output.stdout === "true";
					},
				);

				if (!isLogged) {
					const isUsingCloud = yield* ctx.prompt("Are you using Rivet Cloud?", {
						type: "confirm",
					});

					let endpoint = "https://api.rivet.gg";
					if (!isUsingCloud) {
						endpoint = yield* ctx.prompt("What is the API endpoint?", {
							type: "text",
							defaultValue: "http://localhost:8080",
						});
					}

					yield* ctx.task("Login to Rivet", async function* (ctx) {
						yield* ctx.$`${cli} login --api-endpoint=${endpoint}`;
					});
				}
			});

			const env = yield* ctx.task("Select environment", async function* () {
				const { stdout } = await $`${cli} env ls --json`;
				const envs = JSON.parse(stdout);
				return yield* ctx.prompt("Select environment", {
					type: "select",
					choices: envs.map(
						(env: { display_name: string; name_id: string }) => ({
							label: env.display_name,
							value: env.name_id,
						}),
					),
				});
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
					`Run \`${cli} publish manager ${relative}\``,
					async function* (ctx) {
						const output =
							yield* ctx.$`${cli} publish manager --env ${env} ${entrypoint} `;
						if (output.exitCode !== 0) {
							throw ctx.error("Failed to deploy actors.", {
								hint: "Check the logs above for more information.",
							});
						}
					},
				);
			});

			for (const [idx, [actorName, actorPath]] of Object.entries(
				config.actors,
			).entries()) {
				yield* ctx.task(
					`Deploy "${actorName}" (${actorPath}) to Rivet (${idx + 1}/${
						Object.keys(config.actors).length
					})`,
					async function* (ctx) {
						const entrypoint = yield* ctx.task(
							`Create entrypoint for ${actorName}`,
							async function* () {
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
									import config from "../actor-core.config.ts";
									export default createHandler(Actor, config);
								`,
								);

								return entrypoint;
							},
						);

						yield* ctx.task(
							`Run \`${cli} publish ${actorName} ${actorPath}\``,
							async function* (ctx) {
								const output =
									yield* ctx.$`${cli} publish --access=public --env ${env} ${actorName} ${entrypoint}`;

								if (output.exitCode !== 0) {
									throw ctx.error("Failed to deploy actors.", {
										hint: "Check the logs above for more information.",
									});
								}
								yield ctx.render(
									<Box marginY={1}>
										<Text>🎉 Actors deployed successfully!</Text>
									</Box>,
								);
							},
						);
					},
				);
			}
		}).render();
	});
