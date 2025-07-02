import type { DriverConfig, Registry } from "@rivetkit/core";
import type Redis from "ioredis";
import { RedisActorDriver } from "./actor";
import { RedisManagerDriver } from "./manager";
import { RedisCoordinateDriver } from "./coordinate";

export { RedisActorDriver } from  "./actor";
export { RedisManagerDriver } from "./manager";
export { RedisCoordinateDriver } from "./coordinate";

export function createRedisDriver(redis: Redis, registry?: Registry<any>): DriverConfig {
	return {
		topology: "standalone",
		actor: new RedisActorDriver(redis),
		manager: new RedisManagerDriver(redis, registry),
	};
}
