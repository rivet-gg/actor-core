import { ForbiddenError } from "@/errors";
import type { LobbyManagerContext } from "./mod";

export function validateAdminToken(
	c: LobbyManagerContext,
	token: string,
) {
	if (!c.vars.config.admin || c.vars.config.admin.token !== token) throw new ForbiddenError();
}
