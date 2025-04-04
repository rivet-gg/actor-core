#!/usr/bin/env tsx
import { $, chalk } from "zx";

async function getPublicPackages() {
	console.log(chalk.blue("Getting list of public packages..."));
	const { stdout: packagesStdout } =
		await $`pnpm recursive list --json`;

	const list = JSON.parse(packagesStdout);

	const packages = list.filter((pkg) => {
		return pkg.private !== true;
	});

	return packages.map((pkg) => pkg.name)
}

async function setupNpm() {
	// generate token
	await $`npx npm-cli-login -u test -p 1234 -e test@domain.test -r http://0.0.0.0:4873 --config-path .npmrc`;
}

async function run() {

		await setupNpm();

		const pkgs = await getPublicPackages();

		// publish
		for (const pkg of pkgs) {
			console.log(chalk.blue(`Publishing package ${pkg.name}...`));
			await $({
				stdio: "inherit",
			})`pnpm publish --filter=${pkg.name} --access public`;
		}

}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
