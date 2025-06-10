import type {
	ManagerDriver,
	GetForIdInput,
	GetWithKeyInput,
	WorkerOutput,
	CreateInput,
	GetOrCreateWithKeyInput,
} from "rivetkit/driver-helpers";
import { WorkerAlreadyExists } from "rivetkit/errors";
import { Bindings } from "./mod";
import { logger } from "./log";
import { serializeNameAndKey, serializeKey } from "./util";

// Worker metadata structure
interface WorkerData {
	name: string;
	key: string[];
}

// Key constants similar to Redis implementation
const KEYS = {
	WORKER: {
		// Combined key for worker metadata (name and key)
		metadata: (workerId: string) => `worker:${workerId}:metadata`,

		// Key index function for worker lookup
		keyIndex: (name: string, key: string[] = []) => {
			// Use serializeKey for consistent handling of all keys
			return `worker_key:${serializeKey(key)}`;
		},
	},
};

export class CloudflareWorkersManagerDriver implements ManagerDriver {
	async getForId({
		c,
		workerId,
	}: GetForIdInput<{ Bindings: Bindings }>): Promise<WorkerOutput | undefined> {
		if (!c) throw new Error("Missing Hono context");

		// Get worker metadata from KV (combined name and key)
		const workerData = (await c.env.WORKER_KV.get(KEYS.WORKER.metadata(workerId), {
			type: "json",
		})) as WorkerData | null;

		// If the worker doesn't exist, return undefined
		if (!workerData) {
			return undefined;
		}

		// Generate durable ID from workerId for meta
		const durableId = c.env.WORKER_DO.idFromString(workerId);

		return {
			workerId,
			name: workerData.name,
			key: workerData.key,
			meta: durableId,
		};
	}

	async getWithKey({
		c,
		name,
		key,
	}: GetWithKeyInput<{ Bindings: Bindings }>): Promise<
		WorkerOutput | undefined
	> {
		if (!c) throw new Error("Missing Hono context");
		const log = logger();

		log.debug("getWithKey: searching for worker", { name, key });

		// Generate deterministic ID from the name and key
		// This is aligned with how createWorker generates IDs
		const nameKeyString = serializeNameAndKey(name, key);
		const durableId = c.env.WORKER_DO.idFromName(nameKeyString);
		const workerId = durableId.toString();

		// Check if the worker metadata exists
		const workerData = await c.env.WORKER_KV.get(KEYS.WORKER.metadata(workerId), {
			type: "json",
		});

		if (!workerData) {
			log.debug("getWithKey: no worker found with matching name and key", {
				name,
				key,
				workerId,
			});
			return undefined;
		}

		log.debug("getWithKey: found worker with matching name and key", {
			workerId,
			name,
			key,
		});
		return this.#buildWorkerOutput(c, workerId);
	}

	async getOrCreateWithKey(
		input: GetOrCreateWithKeyInput,
	): Promise<WorkerOutput> {
		// TODO: Prevent race condition here
		const getOutput = await this.getWithKey(input);
		if (getOutput) {
			return getOutput;
		} else {
			return await this.createWorker(input);
		}
	}

	async createWorker({
		c,
		name,
		key,
		input,
	}: CreateInput<{ Bindings: Bindings }>): Promise<WorkerOutput> {
		if (!c) throw new Error("Missing Hono context");
		const log = logger();

		// Check if worker with the same name and key already exists
		const existingWorker = await this.getWithKey({ c, name, key });
		if (existingWorker) {
			throw new WorkerAlreadyExists(name, key);
		}

		// Create a deterministic ID from the worker name and key
		// This ensures that workers with the same name and key will have the same ID
		const nameKeyString = serializeNameAndKey(name, key);
		const durableId = c.env.WORKER_DO.idFromName(nameKeyString);
		const workerId = durableId.toString();

		// Init worker
		const worker = c.env.WORKER_DO.get(durableId);
		await worker.initialize({
			name,
			key,
			input,
		});

		// Store combined worker metadata (name and key)
		const workerData: WorkerData = { name, key };
		await c.env.WORKER_KV.put(
			KEYS.WORKER.metadata(workerId),
			JSON.stringify(workerData),
		);

		// Add to key index for lookups by name and key
		await c.env.WORKER_KV.put(KEYS.WORKER.keyIndex(name, key), workerId);

		return {
			workerId,
			name,
			key,
			meta: durableId,
		};
	}

	// Helper method to build worker output from an ID
	async #buildWorkerOutput(
		c: any,
		workerId: string,
	): Promise<WorkerOutput | undefined> {
		const workerData = (await c.env.WORKER_KV.get(KEYS.WORKER.metadata(workerId), {
			type: "json",
		})) as WorkerData | null;

		if (!workerData) {
			return undefined;
		}

		// Generate durable ID for meta
		const durableId = c.env.WORKER_DO.idFromString(workerId);

		return {
			workerId,
			name: workerData.name,
			key: workerData.key,
			meta: durableId,
		};
	}
}
