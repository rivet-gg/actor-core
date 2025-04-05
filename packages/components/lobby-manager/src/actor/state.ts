import type * as State from "@/utils/lobby_manager/state/mod";
import type { LobbyManagerContext } from "./mod";

export function currentState(c: LobbyManagerContext): State.State {
	return c.state.state;
}
