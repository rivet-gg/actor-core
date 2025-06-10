import { getLogger } from "@/common//log";

export const LOGGER_NAME = "actor-app";

export function logger() {
	return getLogger(LOGGER_NAME);
}
