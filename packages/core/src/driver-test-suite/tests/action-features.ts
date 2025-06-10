import { describe, test, expect } from "vitest";
import type { DriverTestConfig } from "../mod";
import { setupDriverTest } from "../utils";
import {
	ACTION_TIMEOUT_APP_PATH,
	ACTION_TYPES_APP_PATH,
	type ActionTimeoutApp,
	type ActionTypesApp,
} from "../test-apps";
import { WorkerError } from "@/client/errors";

export function runActionFeaturesTests(driverTestConfig: DriverTestConfig) {
	describe("Action Features", () => {
		// TODO: These do not work with fake timers
		describe.skip("Action Timeouts", () => {
			let usesFakeTimers = !driverTestConfig.useRealTimers;

			test("should timeout actions that exceed the configured timeout", async (c) => {
				const { client } = await setupDriverTest<ActionTimeoutApp>(
					c,
					driverTestConfig,
					ACTION_TIMEOUT_APP_PATH,
				);

				// The quick action should complete successfully
				const quickResult = await client.shortTimeoutWorker
					.getOrCreate()
					.quickAction();
				expect(quickResult).toBe("quick response");

				// The slow action should throw a timeout error
				await expect(
					client.shortTimeoutWorker.getOrCreate().slowAction(),
				).rejects.toThrow("Action timed out");
			});

			test("should respect the default timeout", async (c) => {
				const { client } = await setupDriverTest<ActionTimeoutApp>(
					c,
					driverTestConfig,
					ACTION_TIMEOUT_APP_PATH,
				);

				// This action should complete within the default timeout
				const result = await client.defaultTimeoutWorker
					.getOrCreate()
					.normalAction();
				expect(result).toBe("normal response");
			});

			test("non-promise action results should not be affected by timeout", async (c) => {
				const { client } = await setupDriverTest<ActionTimeoutApp>(
					c,
					driverTestConfig,
					ACTION_TIMEOUT_APP_PATH,
				);

				// Synchronous action should not be affected by timeout
				const result = await client.syncWorker.getOrCreate().syncAction();
				expect(result).toBe("sync response");
			});

			test("should allow configuring different timeouts for different workers", async (c) => {
				const { client } = await setupDriverTest<ActionTimeoutApp>(
					c,
					driverTestConfig,
					ACTION_TIMEOUT_APP_PATH,
				);

				// The short timeout worker should fail
				await expect(
					client.shortTimeoutWorker.getOrCreate().slowAction(),
				).rejects.toThrow("Action timed out");

				// The longer timeout worker should succeed
				const result = await client.longTimeoutWorker
					.getOrCreate()
					.delayedAction();
				expect(result).toBe("delayed response");
			});
		});

		describe("Action Sync & Async", () => {
			test("should support synchronous actions", async (c) => {
				const { client } = await setupDriverTest<ActionTypesApp>(
					c,
					driverTestConfig,
					ACTION_TYPES_APP_PATH,
				);

				const instance = client.syncWorker.getOrCreate();

				// Test increment action
				let result = await instance.increment(5);
				expect(result).toBe(5);

				result = await instance.increment(3);
				expect(result).toBe(8);

				// Test getInfo action
				const info = await instance.getInfo();
				expect(info.currentValue).toBe(8);
				expect(typeof info.timestamp).toBe("number");

				// Test reset action (void return)
				await instance.reset();
				result = await instance.increment(0);
				expect(result).toBe(0);
			});

			test("should support asynchronous actions", async (c) => {
				const { client } = await setupDriverTest<ActionTypesApp>(
					c,
					driverTestConfig,
					ACTION_TYPES_APP_PATH,
				);

				const instance = client.asyncWorker.getOrCreate();

				// Test delayed increment
				const result = await instance.delayedIncrement(5);
				expect(result).toBe(5);

				// Test fetch data
				const data = await instance.fetchData("test-123");
				expect(data.id).toBe("test-123");
				expect(typeof data.timestamp).toBe("number");

				// Test successful async operation
				const success = await instance.asyncWithError(false);
				expect(success).toBe("Success");

				// Test error in async operation
				try {
					await instance.asyncWithError(true);
					expect.fail("did not error");
				} catch (error) {
					expect(error).toBeInstanceOf(WorkerError);
					expect((error as WorkerError).message).toBe("Intentional error");
				}
			});

			test("should handle promises returned from actions correctly", async (c) => {
				const { client } = await setupDriverTest<ActionTypesApp>(
					c,
					driverTestConfig,
					ACTION_TYPES_APP_PATH,
				);

				const instance = client.promiseWorker.getOrCreate();

				// Test resolved promise
				const resolvedValue = await instance.resolvedPromise();
				expect(resolvedValue).toBe("resolved value");

				// Test delayed promise
				const delayedValue = await instance.delayedPromise();
				expect(delayedValue).toBe("delayed value");

				// Test rejected promise
				await expect(instance.rejectedPromise()).rejects.toThrow(
					"promised rejection",
				);

				// Check state was updated by the delayed promise
				const results = await instance.getResults();
				expect(results).toContain("delayed");
			});
		});
	});
}
