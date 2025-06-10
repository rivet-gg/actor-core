import type { AnyWorkerInstance } from "./instance";

export class Schedule {
	#worker: AnyWorkerInstance;

	constructor(worker: AnyWorkerInstance) {
		this.#worker = worker;
	}

	async after(duration: number, fn: string, ...args: unknown[]) {
		await this.#worker.scheduleEvent(Date.now() + duration, fn, args);
	}

	async at(timestamp: number, fn: string, ...args: unknown[]) {
		await this.#worker.scheduleEvent(timestamp, fn, args);
	}
}
