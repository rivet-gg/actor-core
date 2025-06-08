import { getLogger } from "@rivetkit/actor/log";

export const LOGGER_NAME = "driver-rivet";

export function logger() {
	return getLogger(LOGGER_NAME);
}
