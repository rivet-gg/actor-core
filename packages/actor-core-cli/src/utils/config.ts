import fs from "node:fs";
import path from "node:path";
import { bundleRequire } from "bundle-require";
import JoyCon from "joycon";
import z from "zod";

const ActorCoreConfig = z
	.object({
		cwd: z.string(),
		actors: z.record(z.string()),
	})
	.refine(async (config) => {
		return Object.values(config.actors).every((actor) =>
			fs.existsSync(path.join(config.cwd, actor)),
		);
	}, "All actor paths must be accessible");

const loadJson = async (filepath: string) => {
	return JSON.parse(await fs.promises.readFile(filepath, "utf8"));
};

export async function loadConfig(
	cwd: string,
): Promise<{ path: string; data: z.infer<typeof ActorCoreConfig> } | null> {
	const configJoycon = new JoyCon();
	const configPath = await configJoycon.resolve({
		files: [
			"actor-core.config.ts",
			"actor-core.config.cts",
			"actor-core.config.mts",
			"actor-core.config.js",
			"actor-core.config.cjs",
			"actor-core.config.mjs",
			"actor-core.config.json",
			"package.json",
		],
		cwd,
		stopDir: path.parse(cwd).root,
		packageKey: "actor-core",
	});

	if (configPath) {
		if (configPath.endsWith(".json")) {
			let data = await loadJson(configPath);
			if (configPath.endsWith("package.json")) {
				data = data["actor-core"];
			}
			if (data) {
				return { path: configPath, data };
			}
			return null;
		}

		const config = await bundleRequire({
			filepath: configPath,
		});
		return {
			path: configPath,
			data: config.mod.actorcore || config.mod.default || config.mod,
		};
	}

	return null;
}

export async function requireConfig(cwd: string) {
	const config = await loadConfig(cwd);
	if (!config || !config.data) {
		throw new Error("Config not found");
	}
	return config;
}

export async function validateConfig(cwd: string) {
	const config = await requireConfig(cwd);

	return await ActorCoreConfig.parseAsync({
		...config.data,
		cwd: path.dirname(config.path),
	});
}
