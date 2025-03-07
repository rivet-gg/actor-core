import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { assert, beforeAll, describe, expect, it, test } from "vitest";

const PLATFORMS = ["rivet", "nodejs", "bun", "cloudflare-workers"];
const EXAMPLES = ["chat-simple", "counter"];

let container: StartedTestContainer;
beforeAll(async () => {
	const directories = [
		{
			source: "packages/actor-core-cli/dist",
			target: "/app/packages/actor-core-cli/dist",
		},
		{
			source: "packages/create-actor/dist",
			target: "/app/packages/create-actor/dist",
		},
		{
			source: "packages/drivers/memory/dist",
			target: "/app/packages/drivers/memory/dist",
		},
		{
			source: "packages/drivers/redis/dist",
			target: "/app/packages/drivers/redis/dist",
		},
		{
			source: "packages/platforms/rivet/dist",
			target: "/app/packages/platforms/rivet/dist",
		},
		{
			source: "packages/platforms/bun/dist",
			target: "/app/packages/platforms/bun/dist",
		},

		{
			source: "packages/platforms/cloudflare-workers/dist",
			target: "/app/packages/platforms/cloudflare-workers/dist",
		},
		{
			source: "packages/platforms/nodejs/dist",
			target: "/app/packages/platforms/nodejs/dist",
		},
	];

	const files = directories.map((dir) => ({
		source: `${dir.source}/package.json`,
		target: `${dir.target}/package.json`,
	}));

	container = await new GenericContainer("node:lts-alpine")
		.withDefaultLogDriver()
		.withCommand(["sleep", "infinity"])
		.withReuse()
		.withCopyDirectoriesToContainer(directories)
		.withCopyFilesToContainer(files)
		.start();

	for (const dir of directories) {
		await container.exec(["npm", "install"], { workingDir: dir.target });
		await container.exec(["npm", "link"], { workingDir: dir.target });
	}
}, 30e4);

const testCases = PLATFORMS.flatMap((platform) =>
	EXAMPLES.map((example) => [example, platform]),
);

describe("npx create-actor", () => {
	describe.each(testCases)(
		"should create example '%s' for '%s'",
		async (example, platform) => {
			const workingDir = `/app/test-${example}-${platform}`;
			test("it should create directory with files matching the example", async () => {
				const result = await container.exec([
					"npx",
					"@actor-core/cli",
					"create",
					workingDir,
					"--platform",
					platform,
					"--template",
					example,
				]);

				expect(result.exitCode).toBe(0);

				const { stdout: files } = await container.exec([
					"find",
					workingDir,
					"-not",
					"-path",
					"*/node_modules/*",
				]);

				expect(files).toMatchSnapshot();
			});

			it("it should allow user to run check-types script without errors", async () => {
				const result = await container.exec(["npm", "run", "check-types"], {
					workingDir,
				});

				assert.equal(result.exitCode, 0, result.stdout);
			});
		},
		10e4,
	);
});
