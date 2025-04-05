import { test, expect } from "vitest";
import { setupTest } from "actor-core/test";
import { app } from "../src/app";

test("it should count", async () => {
	const { client } = await setupTest(app);
	const counter = await client.counter.get();
	
	// Test initial count
	expect(await counter.getCount()).toBe(0);
	
	// Test event emission
	let eventCount = -1;
	counter.on("newCount", (count: number) => {
		eventCount = count;
	});
	
	// Test increment
	const incrementAmount = 5;
	const result = await counter.increment(incrementAmount);
	expect(result).toBe(incrementAmount);
	
	// Verify event was emitted with correct count
	expect(eventCount).toBe(incrementAmount);
	
	// Test multiple increments
	for (let i = 1; i <= 3; i++) {
		const newCount = await counter.increment(incrementAmount);
		expect(newCount).toBe(incrementAmount * (i + 1));
		expect(eventCount).toBe(incrementAmount * (i + 1));
	}
	
	// Verify final count
	expect(await counter.getCount()).toBe(incrementAmount * 4);
});

