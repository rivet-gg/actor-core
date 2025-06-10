import {
	type Workers,
	type AppConfig,
	type AppConfigInput,
	AppConfigSchema,
} from "./config";

export class WorkerCoreApp<A extends Workers> {
	#config: AppConfig;

	public get config(): AppConfig {
		return this.#config;
	}

	constructor(config: AppConfig) {
		this.#config = config;
	}
}

export function setup<A extends Workers>(
	input: AppConfigInput<A>,
): WorkerCoreApp<A> {
	const config = AppConfigSchema.parse(input);
	return new WorkerCoreApp(config);
}

export type { AppConfig };
export { AppConfigSchema };
