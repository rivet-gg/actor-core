import { getLogger } from "@/common/log";

export const LOGGER_NAME = "worker-coordinate";

export function logger() {
	return getLogger(LOGGER_NAME);
}
