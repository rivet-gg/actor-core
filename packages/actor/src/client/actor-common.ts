import type { AnyActorDefinition, ActorDefinition } from "@/actor/definition";
import type * as protoHttpResolve from "@/actor/protocol/http/resolve";
import type { Encoding } from "@/actor/protocol/serde";
import type { ActorQuery } from "@/manager/protocol/query";
import { logger } from "./log";
import * as errors from "./errors";
import { sendHttpRequest } from "./utils";
import { HEADER_ACTOR_QUERY, HEADER_ENCODING } from "@/actor/router-endpoints";

/**
 * Action function returned by Actor connections and handles.
 *
 * @typedef {Function} ActorActionFunction
 * @template Args
 * @template Response
 * @param {...Args} args - Arguments for the action function.
 * @returns {Promise<Response>}
 */
export type ActorActionFunction<
	Args extends Array<unknown> = unknown[],
	Response = unknown,
> = (
	...args: Args extends [unknown, ...infer Rest] ? Rest : Args
) => Promise<Response>;

/**
 * Maps action methods from actor definition to typed function signatures.
 */
export type ActorDefinitionActions<AD extends AnyActorDefinition> =
	AD extends ActorDefinition<any, any, any, any, infer R>
		? {
				[K in keyof R]: R[K] extends (...args: infer Args) => infer Return
					? ActorActionFunction<Args, Return>
					: never;
			}
		: never;

