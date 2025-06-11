import { getLogger } from "@/common//log";

export const LOGGER_NAME = "worker-partition";

export function logger() {
	return getLogger(LOGGER_NAME);
}
