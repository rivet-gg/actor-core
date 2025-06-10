import { runDriverTests } from "rivetkit/driver-test-suite";
import { deployToRivet, RIVET_CLIENT_CONFIG } from "./rivet-deploy";
import { type RivetClientConfig, rivetRequest } from "../src/rivet-client";
import invariant from "invariant";

let alreadyDeployedManager = false;
const alreadyDeployedApps = new Set();
let managerEndpoint: string | undefined = undefined;

const driverTestConfig = {
	useRealTimers: true,
	HACK_skipCleanupNet: true,
	async start(appPath: string) {
		console.log("Starting test", {
			alreadyDeployedManager,
			alreadyDeployedApps,
			managerEndpoint,
		});

		// Cleanup workers from previous tests
		await deleteAllWorkers(RIVET_CLIENT_CONFIG, !alreadyDeployedManager);

		if (!alreadyDeployedApps.has(appPath)) {
			console.log(`Starting Rivet driver tests with app: ${appPath}`);

			// Deploy to Rivet
			const result = await deployToRivet(appPath, !alreadyDeployedManager);
			console.log(
				`Deployed to Rivet at ${result.endpoint} (manager: ${!alreadyDeployedManager})`,
			);

			// Save as deployed
			managerEndpoint = result.endpoint;
			alreadyDeployedApps.add(appPath);
			alreadyDeployedManager = true;
		} else {
			console.log(`Already deployed: ${appPath}`);
		}

		invariant(managerEndpoint, "missing manager endpoint");
		return {
			endpoint: managerEndpoint,
			async cleanup() {
				await deleteAllWorkers(RIVET_CLIENT_CONFIG, false);
			},
		};
	},
};

async function deleteAllWorkers(
	clientConfig: RivetClientConfig,
	deleteManager: boolean,
) {
	console.log("Listing workers to delete");
	const { workers } = await rivetRequest<
		void,
		{ workers: { id: string; tags: Record<string, string> }[] }
	>(clientConfig, "GET", "/workers");

	for (const worker of workers) {
		if (!deleteManager && worker.tags.name === "manager") continue;

		console.log(`Deleting worker ${worker.id} (${JSON.stringify(worker.tags)})`);
		await rivetRequest<void, void>(
			clientConfig,
			"DELETE",
			`/workers/${worker.id}`,
		);
	}
}

// Run the driver tests with our config
runDriverTests(driverTestConfig);
