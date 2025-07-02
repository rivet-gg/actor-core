import { runDriverTests } from "@rivetkit/core/driver-test-suite";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, exec } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { getPort } from "@rivetkit/core/test";

const execPromise = promisify(exec);

// Bypass createTestRuntime by providing an endpoint directly
runDriverTests({
	useRealTimers: true,
	HACK_skipCleanupNet: true,
	async start(projectPath: string) {
		// Setup project
		if (!setupProjectOnce) {
			setupProjectOnce = setupProject(projectPath);
		}
		const projectDir = await setupProjectOnce;

		console.log("project dir", projectDir);

		// Get an available port
		const port = await getPort();
		const inspectorPort = await getPort();

		// Start wrangler dev
		const wranglerProcess = spawn(
			"pnpm",
			[
				"start",
				"src/index.ts",
				"--port",
				`${port}`,
				"--inspector-port",
				`${inspectorPort}`,
				"--persist-to",
				`/tmp/actors-test-${crypto.randomUUID()}`,
			],
			{
				cwd: projectDir,
				stdio: "pipe",
			},
		);

		// Wait for wrangler to start
		await new Promise<void>((resolve, reject) => {
			let isResolved = false;
			const timeout = setTimeout(() => {
				if (!isResolved) {
					isResolved = true;
					wranglerProcess.kill();
					reject(new Error("Timeout waiting for wrangler to start"));
				}
			}, 30000);

			wranglerProcess.stdout?.on("data", (data) => {
				const output = data.toString();
				console.log(`wrangler: ${output}`);
				if (output.includes(`Ready on http://localhost:${port}`)) {
					if (!isResolved) {
						isResolved = true;
						clearTimeout(timeout);
						resolve();
					}
				}
			});

			wranglerProcess.stderr?.on("data", (data) => {
				console.error(`wrangler: ${data}`);
			});

			wranglerProcess.on("error", (error) => {
				if (!isResolved) {
					isResolved = true;
					clearTimeout(timeout);
					reject(error);
				}
			});

			wranglerProcess.on("exit", (code) => {
				if (!isResolved && code !== 0) {
					isResolved = true;
					clearTimeout(timeout);
					reject(new Error(`wrangler exited with code ${code}`));
				}
			});
		});

		return {
			endpoint: `http://localhost:${port}/registry`,
			async cleanup() {
				// Shut down wrangler process
				wranglerProcess.kill();
			},
		};
	},
});

let setupProjectOnce: Promise<string> | undefined = undefined;

async function setupProject(projectPath: string) {
	// Create a temporary directory for the test
	const uuid = crypto.randomUUID();
	const tmpDir = path.join(os.tmpdir(), `rivetkit-test-${uuid}`);
	await fs.mkdir(tmpDir, { recursive: true });

	// Create package.json with workspace dependencies
	const packageJson = {
		name: "rivetkit-test",
		private: true,
		version: "1.0.0",
		type: "module",
		scripts: {
			start: "wrangler dev",
		},
		dependencies: {
			wrangler: "4.8.0",
		},
		packageManager:
			"pnpm@10.7.1+sha512.2d92c86b7928dc8284f53494fb4201f983da65f0fb4f0d40baafa5cf628fa31dae3e5968f12466f17df7e97310e30f343a648baea1b9b350685dafafffdf5808",
	};
	await fs.writeFile(
		path.join(tmpDir, "package.json"),
		JSON.stringify(packageJson, null, 2),
	);

	// Create node_modules directory and copy necessary packages
	const nodeModulesDir = path.join(tmpDir, "node_modules");
	await fs.mkdir(nodeModulesDir, { recursive: true });
	
	// Copy the built packages from workspace
	const workspaceRoot = path.resolve(__dirname, "../../../..");
	const rivetKitDir = path.join(nodeModulesDir, "@rivetkit");
	await fs.mkdir(rivetKitDir, { recursive: true });
	
	// Copy core package
	const corePackagePath = path.join(workspaceRoot, "packages/core");
	const targetCorePath = path.join(rivetKitDir, "core");
	await fs.cp(corePackagePath, targetCorePath, { recursive: true });
	
	// Copy cloudflare-workers package
	const cfPackagePath = path.join(workspaceRoot, "packages/platforms/cloudflare-workers");
	const targetCfPath = path.join(rivetKitDir, "cloudflare-workers");
	await fs.cp(cfPackagePath, targetCfPath, { recursive: true });
	
	// Copy main rivetkit package
	const mainPackagePath = path.join(workspaceRoot, "packages/rivetkit");
	const targetMainPath = path.join(nodeModulesDir, "rivetkit");
	await fs.cp(mainPackagePath, targetMainPath, { recursive: true });
	
	// Install wrangler only
	await execPromise("pnpm install wrangler@4.8.0", { cwd: tmpDir });

	// Create a wrangler.json file
	const wranglerConfig = {
		name: "rivetkit-test",
		compatibility_date: "2025-01-29",
		compatibility_flags: ["nodejs_compat"],
		migrations: [
			{
				new_classes: ["ActorHandler"],
				tag: "v1",
			},
		],
		durable_objects: {
			bindings: [
				{
					class_name: "ActorHandler",
					name: "ACTOR_DO",
				},
			],
		},
		kv_namespaces: [
			{
				binding: "ACTOR_KV",
				id: "test", // Will be replaced with a mock in dev mode
			},
		],
		observability: {
			enabled: true,
		},
	};
	await fs.writeFile(
		path.join(tmpDir, "wrangler.json"),
		JSON.stringify(wranglerConfig, null, 2),
	);

	// Copy project to test directory
	const projectDestDir = path.join(tmpDir, "src", "actors");
	await fs.cp(projectPath, projectDestDir, { recursive: true });

	// Write script
	const indexContent = `import { createServerHandler } from "@rivetkit/cloudflare-workers";
import { registry } from "./actors/registry";

// TODO: Find a cleaner way of flagging an registry as test mode (ideally not in the config itself)
// Force enable test
registry.config.test.enabled = true;

// Create handlers for Cloudflare Workers
const { handler, ActorHandler } = createServerHandler(registry);

// Export the handlers for Cloudflare
export { handler as default, ActorHandler };
`;
	await fs.writeFile(path.join(tmpDir, "src/index.ts"), indexContent);

	return tmpDir;
}
