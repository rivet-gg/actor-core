import type { ActorContext } from "@rivet-gg/actor-core";
import type { ActorDriver, KvKey, KvValue, AnyActorInstance } from "actor-core/driver-helpers";

export interface ActorDriverContext {
	ctx: ActorContext;
}

export class RivetActorDriver implements ActorDriver {
	#ctx: ActorContext;
	#alarm: { timeout: ReturnType<typeof setTimeout>; timestamp: number } | null = null;

	constructor(ctx: ActorContext) {
		this.#ctx = ctx;
	}

	get context(): ActorDriverContext {
		return { ctx: this.#ctx };
	}

	async kvGet(_actorId: string, key: KvKey): Promise<KvValue | undefined> {
		return await this.#ctx.kv.get(key);
	}

	async kvGetBatch(
		_actorId: string,
		keys: KvKey[],
	): Promise<(KvValue | undefined)[]> {
		const response = await this.#ctx.kv.getBatch(keys);
		return keys.map((key) => response.get(key));
	}

	async kvPut(_actorId: string, key: KvKey, value: KvValue): Promise<void> {
		await this.#ctx.kv.put(key, value);
	}

	async kvPutBatch(
		_actorId: string,
		entries: [KvKey, KvValue][],
	): Promise<void> {
		await this.#ctx.kv.putBatch(new Map(entries));
	}

	async kvDelete(_actorId: string, key: KvKey): Promise<void> {
		await this.#ctx.kv.delete(key);
	}

	async kvDeleteBatch(_actorId: string, keys: KvKey[]): Promise<void> {
		await this.#ctx.kv.deleteBatch(keys);
	}

	async setAlarm(actor: AnyActorInstance, timestamp: number): Promise<void> {
		await this.deleteAlarm(actor);

		const timeout = Math.max(0, timestamp - Date.now());
		const timeoutId = setTimeout(() => {
			actor.onAlarm();
			this.#alarm = null;
		}, timeout);

		this.#alarm = { timeout: timeoutId, timestamp };
	}

	async getAlarm(_actor: AnyActorInstance): Promise<number | null> {
		return this.#alarm?.timestamp ?? null;
	}

	async deleteAlarm(_actor: AnyActorInstance): Promise<void> {
		if (this.#alarm) {
			clearTimeout(this.#alarm.timeout);
			this.#alarm = null;
		}
	}
}
