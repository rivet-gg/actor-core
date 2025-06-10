import { getLogger } from "@/common//log";

/** Logger for this library. */
export const RUNTIME_LOGGER_NAME = "worker-runtime";

/** Logger used for logs from the worker instance itself. */
export const WORKER_LOGGER_NAME = "worker";

export function logger() {
	return getLogger(RUNTIME_LOGGER_NAME);
}

export function instanceLogger() {
	return getLogger(WORKER_LOGGER_NAME);
}

