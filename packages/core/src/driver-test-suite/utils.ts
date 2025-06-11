import type { WorkerCoreApp } from "@/mod";
import { type TestContext, vi } from "vitest";
import { createClient, type Client } from "@/client/mod";
import type { DriverTestConfig } from "./mod";
import { assertUnreachable } from "@/worker/utils";
import { createClientWithDriver } from "@/client/client";
import { createTestInlineClientDriver } from "./test-inline-client-driver";

// Must use `TestContext` since global hooks do not work when running concurrently
export async function setupDriverTest<A extends WorkerCoreApp<any>>(
	c: TestContext,
	driverTestConfig: DriverTestConfig,
	appPath: string,
): Promise<{
	client: Client<A>;
}> {
	if (!driverTestConfig.useRealTimers) {
		vi.useFakeTimers();
	}

	// Build drivers
	const { endpoint, cleanup } = await driverTestConfig.start(appPath);
	c.onTestFinished(cleanup);

	let client: Client<A>;
	if (driverTestConfig.clientType === "http") {
		// Create client
		client = createClient<A>(endpoint, {
			transport: driverTestConfig.transport,
		});
	} else if (driverTestConfig.clientType === "inline") {
		// Use inline client from driver
		const clientDriver = createTestInlineClientDriver(endpoint, driverTestConfig.transport ?? "websocket");
		client = createClientWithDriver(clientDriver);
	} else {
		assertUnreachable(driverTestConfig.clientType);
	}

	// Cleanup client
	if (!driverTestConfig.HACK_skipCleanupNet) {
		c.onTestFinished(async () => await client.dispose());
	}

	return {
		client,
	};
}

export async function waitFor(
	driverTestConfig: DriverTestConfig,
	ms: number,
): Promise<void> {
	if (driverTestConfig.useRealTimers) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	} else {
		vi.advanceTimersByTime(ms);
		return Promise.resolve();
	}
}
