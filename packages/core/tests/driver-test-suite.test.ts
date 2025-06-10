import {
	runDriverTests,
	createTestRuntime,
} from "@/driver-test-suite/mod";
import { TestGlobalState } from "@/test/driver/global-state";
import { TestWorkerDriver } from "@/test/driver/worker";
import { TestManagerDriver } from "@/test/driver/manager";

runDriverTests({
	async start(appPath: string) {
		return await createTestRuntime(appPath, async (app) => {
			const memoryState = new TestGlobalState();
			return {
				workerDriver: new TestWorkerDriver(memoryState),
				managerDriver: new TestManagerDriver(app, memoryState),
			};
		});
	},
});
