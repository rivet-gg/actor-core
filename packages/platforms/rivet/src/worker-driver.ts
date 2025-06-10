import type { WorkerContext } from "@rivet-gg/worker-core";
import type { WorkerDriver, AnyWorkerInstance } from "rivetkit/driver-helpers";

export interface WorkerDriverContext {
	ctx: WorkerContext;
}

export class RivetWorkerDriver implements WorkerDriver {
	#ctx: WorkerContext;

	constructor(ctx: WorkerContext) {
		this.#ctx = ctx;
	}

	getContext(_workerId: string): WorkerDriverContext {
		return { ctx: this.#ctx };
	}

	async readInput(_workerId: string): Promise<unknown | undefined> {
		// Read input
		//
		// We need to have a separate exists flag in order to represent `undefined`
		const entries = await this.#ctx.kv.getBatch([
			["rivetkit", "input", "exists"],
			["rivetkit", "input", "data"],
		]);

		if (entries.get(["rivetkit", "input", "exists"]) === true) {
			return await entries.get(["rivetkit", "input", "data"]);
		} else {
			return undefined;
		}
	}

	async readPersistedData(_workerId: string): Promise<unknown | undefined> {
		let data = await this.#ctx.kv.get(["rivetkit", "data"]);

		// HACK: Modify to be undefined if null. This will be fixed in Workers v2.
		if (data === null) data = undefined;

		return data;
	}

	async writePersistedData(_workerId: string, data: unknown): Promise<void> {
		// Use "state" as the key for persisted data
		await this.#ctx.kv.put(["rivetkit", "data"], data);
	}

	async setAlarm(worker: AnyWorkerInstance, timestamp: number): Promise<void> {
		const timeout = Math.max(0, timestamp - Date.now());
		setTimeout(() => {
			worker.onAlarm();
		}, timeout);
	}
}
