import { assertUnreachable } from "rivetkit/utils";
import { WorkerAlreadyExists, InternalError } from "rivetkit/errors";
import type {
	ManagerDriver,
	GetForIdInput,
	GetWithKeyInput,
	WorkerOutput,
	GetOrCreateWithKeyInput,
	CreateInput,
} from "rivetkit/driver-helpers";
import { logger } from "./log";
import { type RivetClientConfig, rivetRequest } from "./rivet-client";
import { serializeKeyForTag, deserializeKeyFromTag } from "./util";

export interface WorkerState {
	key: string[];
	destroyedAt?: number;
}

export interface GetWorkerMeta {
	endpoint: string;
}

export class RivetManagerDriver implements ManagerDriver {
	#clientConfig: RivetClientConfig;

	constructor(clientConfig: RivetClientConfig) {
		this.#clientConfig = clientConfig;
	}

	async getForId({
		workerId,
	}: GetForIdInput): Promise<WorkerOutput | undefined> {
		try {
			// Get actor
			const res = await rivetRequest<void, { actor: RivetActor }>(
				this.#clientConfig,
				"GET",
				`/actors/${encodeURIComponent(workerId)}`,
			);

			// Check if worker exists and not destroyed
			if (res.actor.destroyedAt) {
				return undefined;
			}

			// Ensure worker has required tags
			if (!("name" in res.actor.tags)) {
				throw new Error(`Worker ${res.actor.id} missing 'name' in tags.`);
			}
			if (res.actor.tags.role !== "worker") {
				throw new Error(`Worker ${res.actor.id} does not have a worker role.`);
			}
			if (res.actor.tags.framework !== "rivetkit") {
				throw new Error(`Worker ${res.actor.id} is not an RivetKit worker.`);
			}

			return {
				workerId: res.actor.id,
				name: res.actor.tags.name,
				key: this.#extractKeyFromRivetTags(res.actor.tags),
				meta: {
					endpoint: buildWorkerEndpoint(res.actor),
				} satisfies GetWorkerMeta,
			};
		} catch (error) {
			// Handle not found or other errors
			return undefined;
		}
	}

	async getWithKey({
		name,
		key,
	}: GetWithKeyInput): Promise<WorkerOutput | undefined> {
		// Convert key array to Rivet's tag format
		const rivetTags = this.#convertKeyToRivetTags(name, key);

		// Query actors with matching tags
		const { actors } = await rivetRequest<void, { actors: RivetActor[] }>(
			this.#clientConfig,
			"GET",
			`/actors?tags_json=${encodeURIComponent(JSON.stringify(rivetTags))}`,
		);

		// Filter workers to ensure they're valid
		const validActors = actors.filter((a: RivetActor) => {
			// Verify all ports have hostname and port
			for (const portName in a.network.ports) {
				const port = a.network.ports[portName];
				if (!port.hostname || !port.port) return false;
			}
			return true;
		});

		if (validActors.length === 0) {
			return undefined;
		}

		// For consistent results, sort by ID if multiple actors match
		const actor =
			validActors.length > 1
				? validActors.sort((a, b) => a.id.localeCompare(b.id))[0]
				: validActors[0];

		// Ensure actor has required tags
		if (!("name" in actor.tags)) {
			throw new Error(`Worker ${actor.id} missing 'name' in tags.`);
		}

		return {
			workerId: actor.id,
			name: actor.tags.name,
			key: this.#extractKeyFromRivetTags(actor.tags),
			meta: {
				endpoint: buildWorkerEndpoint(actor),
			} satisfies GetWorkerMeta,
		};
	}

	async getOrCreateWithKey(
		input: GetOrCreateWithKeyInput,
	): Promise<WorkerOutput> {
		const getOutput = await this.getWithKey(input);
		if (getOutput) {
			return getOutput;
		} else {
			return await this.createWorker(input);
		}
	}

	async createWorker({
		name,
		key,
		region,
		input,
	}: CreateInput): Promise<WorkerOutput> {
		// Check if worker with the same name and key already exists
		const existingWorker = await this.getWithKey({ name, key });
		if (existingWorker) {
			throw new WorkerAlreadyExists(name, key);
		}

		// Create the worker request
		let workerLogLevel: string | undefined = undefined;
		if (typeof Deno !== "undefined") {
			workerLogLevel = Deno.env.get("_WORKER_LOG_LEVEL");
		} else if (typeof process !== "undefined") {
			// Do this after Deno since `process` is sometimes polyfilled
			workerLogLevel = process.env._WORKER_LOG_LEVEL;
		}

		const createRequest = {
			tags: this.#convertKeyToRivetTags(name, key),
			build_tags: {
				role: "worker",
				framework: "rivetkit",
				current: "true",
			},
			region,
			network: {
				ports: {
					http: {
						protocol: "https",
						routing: { guard: {} },
					},
				},
			},
			runtime: {
				environment: workerLogLevel
					? {
							_LOG_LEVEL: workerLogLevel,
						}
					: {},
			},
			lifecycle: {
				durable: true,
			},
		};

		logger().info("creating actor", { ...createRequest });

		// Create the worker
		const { actor } = await rivetRequest<
			typeof createRequest,
			{ actor: RivetActor }
		>(this.#clientConfig, "POST", "/actors", createRequest);

		// Initialize the worker
		try {
			const endpoint = buildWorkerEndpoint(actor);
			const url = `${endpoint}/initialize`;
			logger().debug("initializing worker", {
				url,
				input: JSON.stringify(input),
			});

			const res = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ input }),
			});
			if (!res.ok) {
				throw new InternalError(
					`Worker initialize request failed (${res.status}):\n${await res.text()}`,
				);
			}
		} catch (error) {
			logger().error("failed to initialize worker, destroying worker", {
				workerId: actor.id,
				error,
			});

			// Destroy the worker since it failed to initialize
			await rivetRequest<typeof createRequest, { worker: RivetActor }>(
				this.#clientConfig,
				"DELETE",
				`/actors/${actor.id}`,
			);

			throw error;
		}

		return {
			workerId: actor.id,
			name,
			key: this.#extractKeyFromRivetTags(actor.tags),
			meta: {
				endpoint: buildWorkerEndpoint(actor),
			} satisfies GetWorkerMeta,
		};
	}

	// Helper method to convert a key array to Rivet's tag-based format
	#convertKeyToRivetTags(name: string, key: string[]): Record<string, string> {
		return {
			name,
			key: serializeKeyForTag(key),
			role: "worker",
			framework: "rivetkit",
		};
	}

	// Helper method to extract key array from Rivet's tag-based format
	#extractKeyFromRivetTags(tags: Record<string, string>): string[] {
		return deserializeKeyFromTag(tags.key);
	}

	async #getBuildWithTags(
		buildTags: Record<string, string>,
	): Promise<RivetBuild | undefined> {
		// Query builds with matching tags
		const { builds } = await rivetRequest<void, { builds: RivetBuild[] }>(
			this.#clientConfig,
			"GET",
			`/builds?tags_json=${encodeURIComponent(JSON.stringify(buildTags))}`,
		);

		if (builds.length === 0) {
			return undefined;
		}

		// For consistent results, sort by ID if multiple builds match
		return builds.length > 1
			? builds.sort((a, b) => a.id.localeCompare(b.id))[0]
			: builds[0];
	}
}

function buildWorkerEndpoint(worker: RivetActor): string {
	// Fetch port
	const httpPort = worker.network.ports.http;
	if (!httpPort) throw new Error("missing http port");
	let hostname = httpPort.hostname;
	if (!hostname) throw new Error("missing hostname");
	const port = httpPort.port;
	if (!port) throw new Error("missing port");

	let isTls = false;
	switch (httpPort.protocol) {
		case "https":
			isTls = true;
			break;
		case "http":
		case "tcp":
			isTls = false;
			break;
		case "tcp_tls":
		case "udp":
			throw new Error(`Invalid protocol ${httpPort.protocol}`);
		default:
			assertUnreachable(httpPort.protocol as never);
	}

	const path = httpPort.path ?? "";

	// HACK: Fix hostname inside of Docker Compose
	if (hostname === "127.0.0.1") hostname = "rivet-guard";

	return `${isTls ? "https" : "http"}://${hostname}:${port}${path}`;
}

// biome-ignore lint/suspicious/noExplicitAny: will add api types later
type RivetActor = any;
// biome-ignore lint/suspicious/noExplicitAny: will add api types later
type RivetBuild = any;
