import {
	runDriverTests,
	createTestRuntime,
} from "actor-core/driver-test-suite";
import {
	FileSystemActorDriver,
	FileSystemManagerDriver,
	FileSystemGlobalState,
} from "../src/mod";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

runDriverTests({
	async start(appPath: string) {
		return await createTestRuntime(appPath, async (app) => {
			// Create a unique temp directory for each test
			const testDir = path.join(
				os.tmpdir(),
				`actor-core-fs-tests-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
			);
			await fs.mkdir(testDir, { recursive: true });

			const fileSystemState = new FileSystemGlobalState(testDir);
			return {
				actorDriver: new FileSystemActorDriver(fileSystemState),
				managerDriver: new FileSystemManagerDriver(app, fileSystemState),
				async cleanup() {
					await fs.rmdir(testDir, { recursive: true });

				}
			};
		});
	},
});
