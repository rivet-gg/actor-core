import { getLogger } from "@/common/log";

export const LOGGER_NAME = "actor-p2p";

export function logger() {
	return getLogger(LOGGER_NAME);
}
