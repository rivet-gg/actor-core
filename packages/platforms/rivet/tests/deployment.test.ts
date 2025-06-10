import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployToRivet } from "./rivet-deploy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple counter worker definition to deploy
const COUNTER_WORKER = `
import { worker, setup } from "rivetkit";

const counter = worker({
  state: { count: 0 },
  actions: {
    increment: (c, amount) => {
      c.state.count += amount;
      c.broadcast("newCount", c.state.count);
      return c.state.count;
    },
    getCount: (c) => {
      return c.state.count;
    },
  },
});

export const app = setup({
  workers: { counter },
});

export type App = typeof app;
`;

test("Rivet deployment tests", async () => {
	// Create a temporary path for the counter worker
	const tempFilePath = path.join(
		__dirname,
		"../../../..",
		"target",
		"temp-counter-app.ts",
	);

	// Ensure target directory exists
	await fs.mkdir(path.dirname(tempFilePath), { recursive: true });

	// Write the counter worker file
	await fs.writeFile(tempFilePath, COUNTER_WORKER);

	// Run the deployment
	const result = await deployToRivet(tempFilePath, true);
});
