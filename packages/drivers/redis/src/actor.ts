import type { ActorDriver, KvKey, KvValue } from "actor-core/driver-helpers";
import type Redis from "ioredis";
import { KEYS } from "./keys";
import type { AnyActorInstance } from "actor-core/driver-helpers";

export interface ActorDriverContext {
    redis: Redis;
}

export class RedisActorDriver implements ActorDriver {
    #redis: Redis;
    #subscriptionRedis: Redis | null = null;
    #alarmCallbacks = new Map<string, { actor: AnyActorInstance; timestamp: number }>();

    constructor(redis: Redis) {
        this.#redis = redis;

        // Create a separate connection for subscriptions since a subscribed connection
        // cannot be used for other commands
        this.#subscriptionRedis = redis.duplicate();

        // Subscribe to expired events
        this.#subscriptionRedis.config('SET', 'notify-keyspace-events', 'Ex');
        this.#subscriptionRedis.subscribe('__keyevent@0__:expired');

        // Handle expired events
        this.#subscriptionRedis.on('message', async (_channel, key) => {
            // Extract actor ID from the key
            const match = key.match(/^actor:(.+):alarm$/);
            if (!match) return;

            const actorId = match[1];
            const callback = this.#alarmCallbacks.get(actorId);
            if (callback) {
                // Verify this is still the current alarm before triggering
                const currentAlarm = await this.getAlarm(callback.actor);
                if (currentAlarm === callback.timestamp) {
                    await callback.actor.onAlarm();
                    this.#alarmCallbacks.delete(actorId);
                }
            }
        });
    }

    get context(): ActorDriverContext {
        return { redis: this.#redis };
    }

    async kvGet(actorId: string, key: KvKey): Promise<KvValue | undefined> {
        const value = await this.#redis.get(this.#serializeKey(actorId, key));
        if (value !== null) return JSON.parse(value);
        return undefined;
    }

    async kvGetBatch(actorId: string, key: KvKey[]): Promise<(KvValue | undefined)[]> {
        const values = await this.#redis.mget(key.map((k) => this.#serializeKey(actorId, k)));
        return values.map((v) => {
            if (v !== null) return JSON.parse(v);
            return undefined;
        });
    }

    async kvPut(actorId: string, key: KvKey, value: KvValue): Promise<void> {
        await this.#redis.set(this.#serializeKey(actorId, key), JSON.stringify(value));
    }

    async kvPutBatch(actorId: string, key: [KvKey, KvValue][]): Promise<void> {
        await this.#redis.mset(
            Object.fromEntries(
                key.map(([k, v]) => [this.#serializeKey(actorId, k), JSON.stringify(v)]),
            ),
        );
    }

    async kvDelete(actorId: string, key: KvKey): Promise<void> {
        await this.#redis.del(this.#serializeKey(actorId, key));
    }

    async kvDeleteBatch(actorId: string, key: KvKey[]): Promise<void> {
        await this.#redis.del(key.map((k) => this.#serializeKey(actorId, k)));
    }

    async setAlarm(actor: AnyActorInstance, timestamp: number): Promise<void> {
        const key = KEYS.ACTOR.alarm(actor.id);

        // Delete any existing alarm first
        await this.deleteAlarm(actor);

        const delay = timestamp - Date.now();
        if (delay <= 0) {
            // If timestamp is in the past, trigger immediately
            await actor.onAlarm();
            return;
        }

        // Store both the actor instance and timestamp for callback verification
        this.#alarmCallbacks.set(actor.id, { actor, timestamp });

        // Set the key with expiration
        await this.#redis.set(key, timestamp.toString(), 'PX', delay);
    }

    async getAlarm(actor: AnyActorInstance): Promise<number | null> {
        const key = KEYS.ACTOR.alarm(actor.id);

        // Get the timestamp value
        const value = await this.#redis.get(key);
        if (!value) return null;

        return Number.parseInt(value, 10);
    }

    async deleteAlarm(actor: AnyActorInstance): Promise<void> {
        const key = KEYS.ACTOR.alarm(actor.id);
        await this.#redis.del(key);
        this.#alarmCallbacks.delete(actor.id);
    }

    #serializeKey(actorId: string, key: KvKey): string {
        return KEYS.ACTOR.kv(actorId, typeof key === 'string' ? key : JSON.stringify(key));
    }
}
