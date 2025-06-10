import { describe, test, expect, vi } from "vitest";
import { setupDriverTest } from "../utils";
import { WorkerError } from "@/client/mod";
import {
	COUNTER_APP_PATH,
	ACTION_INPUTS_APP_PATH,
	type CounterApp,
	type ActionInputsApp,
} from "../test-apps";
import { DriverTestConfig } from "../mod";

export function runManagerDriverTests(driverTestConfig: DriverTestConfig) {
	describe("Manager Driver Tests", () => {
		describe("Client Connection Methods", () => {
			test("connect() - finds or creates a worker", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Basic connect() with no parameters creates a default worker
				const counterA = client.counter.getOrCreate();
				await counterA.increment(5);

				// Get the same worker again to verify state persisted
				const counterAAgain = client.counter.getOrCreate();
				const count = await counterAAgain.increment(0);
				expect(count).toBe(5);

				// Connect with key creates a new worker with specific parameters
				const counterB = client.counter.getOrCreate(["counter-b", "testing"]);

				await counterB.increment(10);
				const countB = await counterB.increment(0);
				expect(countB).toBe(10);
			});

			test("throws WorkerAlreadyExists when creating duplicate workers", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create a unique worker with specific key
				const uniqueKey = ["duplicate-worker-test", crypto.randomUUID()];
				const counter = client.counter.getOrCreate(uniqueKey);
				await counter.increment(5);

				// Expect duplicate worker
				try {
					await client.counter.create(uniqueKey);
					expect.fail("did not error on duplicate create");
				} catch (err) {
					expect(err).toBeInstanceOf(WorkerError);
					expect((err as WorkerError).code).toBe("worker_already_exists");
				}

				// Verify the original worker still works and has its state
				const count = await counter.increment(0);
				expect(count).toBe(5);
			});
		});

		describe("Connection Options", () => {
			test("get without create prevents worker creation", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Try to get a nonexistent worker with no create
				const nonexistentId = `nonexistent-${crypto.randomUUID()}`;

				// Should fail when worker doesn't exist
				try {
					await client.counter.get([nonexistentId]).resolve();
					expect.fail("did not error for get");
				} catch (err) {
					expect(err).toBeInstanceOf(WorkerError);
					expect((err as WorkerError).code).toBe("worker_not_found");
				}

				// Create the worker
				const createdCounter = client.counter.getOrCreate(nonexistentId);
				await createdCounter.increment(3);

				// Now no create should work since the worker exists
				const retrievedCounter = client.counter.get(nonexistentId);

				const count = await retrievedCounter.increment(0);
				expect(count).toBe(3);
			});

			test("connection params are passed to workers", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create a worker with connection params
				// Note: In a real test we'd verify these are received by the worker,
				// but our simple counter worker doesn't use connection params.
				// This test just ensures the params are accepted by the driver.
				const counter = client.counter.getOrCreate(undefined, {
					params: {
						userId: "user-123",
						authToken: "token-abc",
						settings: { increment: 5 },
					},
				});

				await counter.increment(1);
				const count = await counter.increment(0);
				expect(count).toBe(1);
			});
		});

		describe("Worker Creation & Retrieval", () => {
			test("creates and retrieves workers by ID", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create a unique ID for this test
				const uniqueId = `test-counter-${crypto.randomUUID()}`;

				// Create worker with specific ID
				const counter = client.counter.getOrCreate([uniqueId]);
				await counter.increment(10);

				// Retrieve the same worker by ID and verify state
				const retrievedCounter = client.counter.getOrCreate([uniqueId]);
				const count = await retrievedCounter.increment(0); // Get current value
				expect(count).toBe(10);
			});

			test("passes input to worker during creation", async (c) => {
				const { client } = await setupDriverTest<ActionInputsApp>(
					c,
					driverTestConfig,
					ACTION_INPUTS_APP_PATH,
				);

				// Test data to pass as input
				const testInput = {
					name: "test-worker",
					value: 42,
					nested: { foo: "bar" },
				};

				// Create worker with input
				const worker = await client.inputWorker.create(undefined, {
					input: testInput,
				});

				// Verify both createState and onCreate received the input
				const inputs = await worker.getInputs();

				// Input should be available in createState
				expect(inputs.initialInput).toEqual(testInput);

				// Input should also be available in onCreate lifecycle hook
				expect(inputs.onCreateInput).toEqual(testInput);
			});

			test("input is undefined when not provided", async (c) => {
				const { client } = await setupDriverTest<ActionInputsApp>(
					c,
					driverTestConfig,
					ACTION_INPUTS_APP_PATH,
				);

				// Create worker without providing input
				const worker = await client.inputWorker.create();

				// Get inputs and verify they're undefined
				const inputs = await worker.getInputs();

				// Should be undefined in createState
				expect(inputs.initialInput).toBeUndefined();

				// Should be undefined in onCreate lifecycle hook too
				expect(inputs.onCreateInput).toBeUndefined();
			});

			test("getOrCreate passes input to worker during creation", async (c) => {
				const { client } = await setupDriverTest<ActionInputsApp>(
					c,
					driverTestConfig,
					ACTION_INPUTS_APP_PATH,
				);

				// Create a unique key for this test
				const uniqueKey = [`input-test-${crypto.randomUUID()}`];

				// Test data to pass as input
				const testInput = {
					name: "getorcreate-test",
					value: 100,
					nested: { baz: "qux" },
				};

				// Use getOrCreate with input
				const worker = client.inputWorker.getOrCreate(uniqueKey, {
					createWithInput: testInput,
				});

				// Verify both createState and onCreate received the input
				const inputs = await worker.getInputs();

				// Input should be available in createState
				expect(inputs.initialInput).toEqual(testInput);

				// Input should also be available in onCreate lifecycle hook
				expect(inputs.onCreateInput).toEqual(testInput);

				// Verify that calling getOrCreate again with the same key
				// returns the existing worker and doesn't create a new one
				const existingWorker = client.inputWorker.getOrCreate(uniqueKey);
				const existingInputs = await existingWorker.getInputs();

				// Should still have the original inputs
				expect(existingInputs.initialInput).toEqual(testInput);
				expect(existingInputs.onCreateInput).toEqual(testInput);
			});

			// TODO: Correctly test region for each provider
			//test("creates and retrieves workers with region", async (c) => {
			//	const { client } = await setupDriverTest<CounterApp>(c,
			//		driverTestConfig,
			//		COUNTER_APP_PATH
			//	);
			//
			//	// Create worker with a specific region
			//	const counter = client.counter.getOrCreate({
			//		create: {
			//			key: ["metadata-test", "testing"],
			//			region: "test-region",
			//		},
			//	});
			//
			//	// Set state to identify this specific instance
			//	await counter.increment(42);
			//
			//	// Retrieve by ID (since metadata is not used for retrieval)
			//	const retrievedCounter = client.counter.getOrCreate(["metadata-test"]);
			//
			//	// Verify it's the same instance
			//	const count = await retrievedCounter.increment(0);
			//	expect(count).toBe(42);
			//});
		});

		describe("Key Matching", () => {
			test("matches workers only with exactly the same keys", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create worker with multiple keys
				const originalCounter = client.counter.getOrCreate([
					"counter-match",
					"test",
					"us-east",
				]);
				await originalCounter.increment(10);

				// Should match with exact same keys
				const exactMatchCounter = client.counter.getOrCreate([
					"counter-match",
					"test",
					"us-east",
				]);
				const exactMatchCount = await exactMatchCounter.increment(0);
				expect(exactMatchCount).toBe(10);

				// Should NOT match with subset of keys - should create new worker
				const subsetMatchCounter = client.counter.getOrCreate([
					"counter-match",
					"test",
				]);
				const subsetMatchCount = await subsetMatchCounter.increment(0);
				expect(subsetMatchCount).toBe(0); // Should be a new counter with 0

				// Should NOT match with just one key - should create new worker
				const singleKeyCounter = client.counter.getOrCreate(["counter-match"]);
				const singleKeyCount = await singleKeyCounter.increment(0);
				expect(singleKeyCount).toBe(0); // Should be a new counter with 0
			});

			test("string key matches array with single string key", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create worker with string key
				const stringKeyCounter = client.counter.getOrCreate("string-key-test");
				await stringKeyCounter.increment(7);

				// Should match with equivalent array key
				const arrayKeyCounter = client.counter.getOrCreate(["string-key-test"]);
				const count = await arrayKeyCounter.increment(0);
				expect(count).toBe(7);
			});

			test("undefined key matches empty array key and no key", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create worker with undefined key
				const undefinedKeyCounter = client.counter.getOrCreate(undefined);
				await undefinedKeyCounter.increment(12);

				// Should match with empty array key
				const emptyArrayKeyCounter = client.counter.getOrCreate([]);
				const emptyArrayCount = await emptyArrayKeyCounter.increment(0);
				expect(emptyArrayCount).toBe(12);

				// Should match with no key
				const noKeyCounter = client.counter.getOrCreate();
				const noKeyCount = await noKeyCounter.increment(0);
				expect(noKeyCount).toBe(12);
			});

			test("no keys does not match workers with keys", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create counter with keys
				const keyedCounter = client.counter.getOrCreate([
					"counter-with-keys",
					"special",
				]);
				await keyedCounter.increment(15);

				// Should not match when searching with no keys
				const noKeysCounter = client.counter.getOrCreate();
				const count = await noKeysCounter.increment(10);
				expect(count).toBe(10);
			});

			test("workers with keys match workers with no keys", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create a counter with no keys
				const noKeysCounter = client.counter.getOrCreate();
				await noKeysCounter.increment(25);

				// Get counter with keys - should create a new one
				const keyedCounter = client.counter.getOrCreate([
					"new-counter",
					"prod",
				]);
				const keyedCount = await keyedCounter.increment(0);

				// Should be a new counter, not the one created above
				expect(keyedCount).toBe(0);
			});
		});

		describe("Multiple Worker Instances", () => {
			// TODO: This test is flakey https://github.com/rivet-gg/worker-core/issues/873
			test("creates multiple worker instances of the same type", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Create multiple instances with different IDs
				const instance1 = client.counter.getOrCreate(["multi-1"]);
				const instance2 = client.counter.getOrCreate(["multi-2"]);
				const instance3 = client.counter.getOrCreate(["multi-3"]);

				// Set different states
				await instance1.increment(1);
				await instance2.increment(2);
				await instance3.increment(3);

				// Retrieve all instances again
				const retrieved1 = client.counter.getOrCreate(["multi-1"]);
				const retrieved2 = client.counter.getOrCreate(["multi-2"]);
				const retrieved3 = client.counter.getOrCreate(["multi-3"]);

				// Verify separate state
				expect(await retrieved1.increment(0)).toBe(1);
				expect(await retrieved2.increment(0)).toBe(2);
				expect(await retrieved3.increment(0)).toBe(3);
			});

			test("handles default instance with no explicit ID", async (c) => {
				const { client } = await setupDriverTest<CounterApp>(
					c,
					driverTestConfig,
					COUNTER_APP_PATH,
				);

				// Get default instance (no ID specified)
				const defaultCounter = client.counter.getOrCreate();

				// Set state
				await defaultCounter.increment(5);

				// Get default instance again
				const sameDefaultCounter = client.counter.getOrCreate();

				// Verify state is maintained
				const count = await sameDefaultCounter.increment(0);
				expect(count).toBe(5);
			});
		});
	});
}
