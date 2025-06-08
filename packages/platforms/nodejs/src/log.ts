import { getLogger } from "@rivetkit/actor/log";

export const LOGGER_NAME = "nodejs";

export function logger() {
	return getLogger(LOGGER_NAME);
}
