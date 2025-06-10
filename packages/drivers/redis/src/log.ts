import { getLogger } from "rivetkit/log";

export const LOGGER_NAME = "driver-redis";

export function logger() {
	return getLogger(LOGGER_NAME);
}
