import { LogLevel } from "./log-levels";
import pino from "pino";
import pretty from "pino-pretty";

export type Logger = pino.BaseLogger;

const loggers: Record<string, Logger> = {};

export function getLogger(name = "default"): Logger {
	const defaultLogLevelEnv =
		typeof process !== "undefined" && process.env._LOG_LEVEL
			? LogLevel[process.env._LOG_LEVEL as keyof typeof LogLevel]
			: undefined;

	const defaultLogLevel = LogLevel[
		defaultLogLevelEnv ?? LogLevel.INFO
	] as pino.Level;

	if (!loggers[name]) {
		const stream = pretty({
			minimumLevel: defaultLogLevel,
			colorize: true,
		});
		const logger = pino({ msgPrefix: `[${name}] ` }, stream);
		loggers[name] = logger;
	}
	return loggers[name];
}
// function getEnv(name: string): string | undefined {
// 	if (typeof window !== "undefined" && window.localStorage) {
// 		return window.localStorage.getItem(name) || undefined;
// 	}
// 	return undefined;
// 	// TODO(ACTR-9): Add back env config once node compat layer works
// 	//return crossGetEnv(name);
// }

export function setupLogging() {
	// Do nothing for now
}
