import type { AnyActorConstructor, BaseConfig } from "actor-core/platform";
import type { RedisOptions } from "ioredis";

export interface RedisConfig extends BaseConfig {
	actors: Record<string, AnyActorConstructor>;
	redis?: Pick<
		RedisOptions,
		| "port"
		| "host"
		| "tls"
		| "socketTimeout"
		| "keepAlive"
		| "noDelay"
		| "connectionName"
		| "username"
		| "password"
		| "db"
		| "name"
		| "sentinels"
		| "role"
		| "preferredSlaves"
	>;
}
