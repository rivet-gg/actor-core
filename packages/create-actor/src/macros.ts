import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import micromatch from "micromatch";
import pkgJson from "../package.json" with { type: "json" };
import { PLATFORM_SLUGS } from "./platforms";

const EXAMPLES_PATH = path.join(__dirname, "../../../examples");

const IGNORED_PATHS = /platforms|benches|tsconfig.json/;

interface ExamplesRegistry {
	[key: string]: {
		name: string;
		slug: string;
		supports: string[];
		files: Record<string, string>;
	};
}

export async function getExamples(): Promise<ExamplesRegistry> {
	const registry: ExamplesRegistry = {};

	const dirs = await readdir(EXAMPLES_PATH, { encoding: "utf-8" });

	for (const dir of dirs) {
		const files = await readdir(path.join(EXAMPLES_PATH, dir), {
			encoding: "utf-8",
			recursive: true,
		});

		const packageJson = await readFile(
			path.join(EXAMPLES_PATH, dir, "package.json"),
			{ encoding: "utf-8" },
		);

		registry[dir] = {
			slug: dir,
			name: JSON.parse(packageJson).name,
			supports: micromatch(
				PLATFORM_SLUGS,
				JSON.parse(packageJson).example.platforms,
				{},
			),
			files: {},
		};

		for (const file of files) {
			if (IGNORED_PATHS.test(file)) {
				continue;
			}

			const info = await stat(path.join(EXAMPLES_PATH, dir, file));
			if (info.isDirectory()) {
				continue;
			}

			registry[dir].files[file] = await readFile(
				path.join(EXAMPLES_PATH, dir, file),
				{ encoding: "utf-8" },
			);
		}
	}

	return registry;
}

export const VERSION = pkgJson.version;
