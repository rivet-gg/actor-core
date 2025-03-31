import type { ActorDriver, KvKey, KvValue, AnyActorInstance } from "@/driver-helpers/mod";
import type { TestGlobalState } from "./global_state";

export interface ActorDriverContext {
	state: TestGlobalState;
}

export class TestActorDriver implements ActorDriver {
	#state: TestGlobalState;
	#alarms: Map<string, { timeout: NodeJS.Timeout; timestamp: number }> = new Map();

	constructor(state: TestGlobalState) {
		this.#state = state;
	}

	get context(): ActorDriverContext {
		return { state: this.#state };
	}

	async kvGet(actorId: string, key: KvKey): Promise<KvValue | undefined> {
		const serializedKey = this.#serializeKey(key);
		const value = this.#state.getKv(actorId, serializedKey);

		if (value !== undefined) return JSON.parse(value);
		return undefined;
	}

	async kvGetBatch(
		actorId: string,
		keys: KvKey[],
	): Promise<(KvValue | undefined)[]> {
		return keys.map((key) => {
			const serializedKey = this.#serializeKey(key);
			const value = this.#state.getKv(actorId, serializedKey);
			if (value !== undefined) return JSON.parse(value);
			return undefined;
		});
	}

	async kvPut(actorId: string, key: KvKey, value: KvValue): Promise<void> {
		const serializedKey = this.#serializeKey(key);
		this.#state.putKv(actorId, serializedKey, JSON.stringify(value));
	}

	async kvPutBatch(
		actorId: string,
		keyValuePairs: [KvKey, KvValue][],
	): Promise<void> {
		for (const [key, value] of keyValuePairs) {
			const serializedKey = this.#serializeKey(key);
			this.#state.putKv(actorId, serializedKey, JSON.stringify(value));
		}
	}

	async kvDelete(actorId: string, key: KvKey): Promise<void> {
		const serializedKey = this.#serializeKey(key);
		this.#state.deleteKv(actorId, serializedKey);
	}

	async kvDeleteBatch(actorId: string, keys: KvKey[]): Promise<void> {
		for (const key of keys) {
			const serializedKey = this.#serializeKey(key);
			this.#state.deleteKv(actorId, serializedKey);
		}
	}

	async setAlarm(actor: AnyActorInstance, timestamp: number): Promise<void> {
		// Clear any existing alarm for this actor
		await this.deleteAlarm(actor);

		const expires = Math.max(timestamp - Date.now(), 0);
		// Set new alarm
		const timeout = setTimeout(() => {
			actor.onAlarm();
			this.#alarms.delete(actor.id);
		}, expires);

		this.#alarms.set(actor.id, { timeout, timestamp });
	}

	async getAlarm(actor: AnyActorInstance): Promise<number | null> {
		const alarm = this.#alarms.get(actor.id);
		return alarm ? alarm.timestamp : null;
	}

	async deleteAlarm(actor: AnyActorInstance): Promise<void> {
		const alarm = this.#alarms.get(actor.id);
		if (alarm) {
			clearTimeout(alarm.timeout);
			this.#alarms.delete(actor.id);
		}
	}

	// Simple key serialization without depending on keys.ts
	#serializeKey(key: KvKey): string {
		return JSON.stringify(key);
	}
}
