import { ForbiddenError } from "@/errors";
import type { LobbyManagerContext } from "./mod";
import type { Config } from "@/config";

export function validateAdminToken(
	c: LobbyManagerContext,
	token: string,
) {
	if (!c.vars.config.admin || c.vars.config.admin.token !== token) throw new ForbiddenError();
}
