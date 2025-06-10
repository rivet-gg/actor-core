import { getLogger } from "rivetkit/log";

export const LOGGER_NAME = "bun";

export function logger() {
	return getLogger(LOGGER_NAME);
}
