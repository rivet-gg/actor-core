import { getLogger } from "@rivetkit/actor/log";

export const LOGGER_NAME = "bun";

export function logger() {
	return getLogger(LOGGER_NAME);
}
