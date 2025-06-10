import {
	type WorkerConfigInput,
	WorkerConfigSchema,
	type Actions,
	type WorkerConfig,
} from "./config";
import { WorkerDefinition } from "./definition";

export type { WorkerContext } from "./context";
export { UserError, type UserErrorOptions } from "./errors";
export type { Conn } from "./connection";
export type { ActionContext } from "./action";
export type { WorkerConfig, OnConnectOptions } from "./config";
export type { Encoding } from "@/worker/protocol/serde";
export type { WorkerKey } from "@/common/utils";
export type {
	WorkerDefinition,
	AnyWorkerDefinition,
	WorkerContextOf,
	ActionContextOf,
} from "./definition";

export function worker<S, CP, CS, V, R extends Actions<S, CP, CS, V>>(
	input: WorkerConfigInput<S, CP, CS, V, R>,
): WorkerDefinition<S, CP, CS, V, R> {
	const config = WorkerConfigSchema.parse(input) as WorkerConfig<S, CP, CS, V>;
	return new WorkerDefinition(config);
}
