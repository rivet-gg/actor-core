import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getExamples } from "../packages/actor-core-cli/src/macros";

async function main() {
	const examples = await getExamples();
	const createActorPath = path.join(
		__dirname,
		"../packages/create-actor/index.js",
	);
	const targetDir = path.join(__dirname, "../templates");

	for (const example of Object.values(examples)) {
		for (const platform of example.supports) {
			const result = spawnSync(
				createActorPath,
				[
					"--overwrite",
					"--template",
					example.slug,
					"--platform",
					platform,
					"--workspace",
					path.join(targetDir, `${example.slug}/${platform}`),
				],
				{ stdio: "inherit" },
			);
			
			if (result.status === null) {
				throw new Error(`Process failed to execute for ${example.slug}/${platform}: ${result.error?.message || 'Unknown error'}`);
			} else if (result.status !== 0) {
				throw new Error(`Process exited with code ${result.status} for ${example.slug}/${platform}`);
			}
		}
	}

	//fs.writeFileSync(path.join(targetDir, ".gitignore"), "*\n");
}

main().catch(console.error);
