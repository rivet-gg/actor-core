import { Derived, Effect, Store, type Updater } from "@tanstack/store";
import { worker, type WorkerCoreApp } from "rivetkit";
import type {
	Client,
	ExtractWorkersFromApp,
	WorkerHandle,
} from "rivetkit/client";

export type AnyWorkerCoreApp = WorkerCoreApp<any>;

export interface RivetKitStore {
	workers: Record<
		string,
		{
			handle: WorkerHandle<any>;
			enabled?: boolean;
			isConnected?: boolean;
			isConnecting?: boolean;
			connection?: any; // The type of connection can vary based on the worker
			isError?: boolean;
			error: Error | null;
		}
	>;
}

export interface WorkerOptions<
	App extends AnyWorkerCoreApp,
	WorkerName extends ExtractWorkersFromApp<App>,
> {
	name: WorkerName;
	key: string | string[];
	params?: App[ExtractWorkersFromApp<App>]["params"];
	enabled?: boolean;
}

export interface CreateRivetKitOptions<App extends AnyWorkerCoreApp> {
	hashFunction?: (opts: WorkerOptions<App, any>) => string;
}

export function createRivetKit<App extends AnyWorkerCoreApp>(
	client: Client<App>,
	opts: CreateRivetKitOptions<App> = {},
) {
	const store = new Store<RivetKitStore>({
		workers: {},
	});

	const hash = opts.hashFunction || defaultHashFunction;

	const cache = new Map<string, Derived<RivetKitStore["workers"][string]>>();

	function getOrCreateWorker(opts: WorkerOptions<any, any>) {
		const key = hash(opts);
		const cached = cache.get(key);
		if (cached) {
			return cached;
		}

		const derived = new Derived({
			fn: ({ currDepVals: [store] }) => {
				return store.workers[key];
			},
			deps: [store],
		});

		function create() {
			async function createWorkerConnection() {
				const worker = store.state.workers[key];
				try {
					const opts = {
						...worker.opts.params,
						signal: AbortSignal.timeout(0), // 10 seconds timeout
					};
					return await client.create(worker.opts.name, worker.opts.key, opts);
				} catch (error) {
					store.setState((prev) => {
						prev.workers[key].isConnecting = false;
						prev.workers[key].isError = true;
						prev.workers[key].error = error;
						return prev;
					});
				}
			}

			store.setState((prev) => {
				prev.workers[key].isConnecting = true;
				prev.workers[key].isError = false;
				prev.workers[key].error = null;
				prev.workers[key].connection = createWorkerConnection();
				return prev;
			});
		}

		// connect effect
		const effect = new Effect({
			fn: () => {
				// check if prev state is different from current state
				// do a shallow comparison

				const worker = store.state.workers[key];

				const isSame =
					JSON.stringify(store.prevState.workers[key].opts) ===
					JSON.stringify(store.state.workers[key].opts);

				if (
					isSame &&
					!worker.isConnected &&
					!worker.isConnecting &&
					!worker.isError &&
					worker.opts.enabled
				) {
					create();
				}
			},
			deps: [derived],
		});

		store.setState((prev) => {
			if (prev.workers[key]) {
				return prev;
			}
			prev.workers[key] = {
				// handle: worker(client, opts.name, opts.params),
				isConnected: false,
				isConnecting: false,
				connection: null,
				isError: false,
				error: null,
			};
			return prev;
		});

		function setState(updater: Updater<RivetKitStore["workers"][string]>) {
			store.setState((prev) => {
				const worker = prev.workers[key];
				if (!worker) {
					throw new Error(`Worker with key "${key}" does not exist.`);
				}

				if (typeof updater === "function") {
					prev.workers[key] = updater(worker);
				} else {
					// If updater is a direct value, we assume it replaces the entire worker state
					prev.workers[key] = updater;
				}
				return prev;
			});
		}

		const mount = () => {
			const unsubscribeDerived = derived.mount();
			const unsubscribeEffect = effect.mount();

			return () => {
				unsubscribeDerived();
				unsubscribeEffect();
			};
		};

		cache.set(key, { state: derived, mount, setState, create });

		return { mount, setState, state: derived, create };
	}

	return {
		getOrCreateWorker,
		store,
	};
}

function defaultHashFunction({ name, key, params }: WorkerOptions<any, any>) {
	return JSON.stringify({ name, key, params });
}
