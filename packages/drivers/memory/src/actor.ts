import type { ActorDriver, KvKey, KvValue, AnyActorInstance } from "actor-core/driver-helpers";
import type { MemoryGlobalState } from "./global_state";

export interface ActorDriverContext {
	state: MemoryGlobalState;
}

export class MemoryActorDriver implements ActorDriver {
	#state: MemoryGlobalState;
	#alarms = new Map<string, { timeout: NodeJS.Timeout; timestamp: number }>();

	constructor(state: MemoryGlobalState) {
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
		// Clear any existing alarm
		await this.deleteAlarm(actor);

		// Set new alarm
		const timeout = setTimeout(() => {
			actor.onAlarm();
			this.#alarms.delete(actor.id);
		}, timestamp - Date.now());

		this.#alarms.set(actor.id, { timeout, timestamp });
	}

	async getAlarm(actor: AnyActorInstance): Promise<number | null> {
		const alarm = this.#alarms.get(actor.id);
		return alarm?.timestamp ?? null;
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
