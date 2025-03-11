import type { AnyActorConstructor } from "actor-core";
import { LobbyManager } from "./actor";
import { type InputConfig, ConfigSchema } from "./config";

export { LobbyManager };

export function lobbyManager(inputConfig: InputConfig): AnyActorConstructor {
	const config = ConfigSchema.parse(inputConfig);
	return class extends LobbyManager {
		constructor() {
			super(config);
		}
	};
}
