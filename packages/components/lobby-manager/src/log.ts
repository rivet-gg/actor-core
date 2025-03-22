import { getLogger } from "actor-core/log";

export const LOGGER_NAME = "component-lobby-manager";

export function logger() {
	return getLogger(LOGGER_NAME);
}
