import { getLogger } from "@/common//log";

export const LOGGER_NAME = "worker-manager";

export function logger() {
	return getLogger(LOGGER_NAME);
}
