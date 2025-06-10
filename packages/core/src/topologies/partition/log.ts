import { getLogger } from "@/common//log";

export const LOGGER_NAME = "worker-standalone";

export function logger() {
	return getLogger(LOGGER_NAME);
}
