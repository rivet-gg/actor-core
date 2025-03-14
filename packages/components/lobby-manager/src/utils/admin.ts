import { ForbiddenError } from "@/errors";

export function adminGuard(ctx: any, inputToken: string) {
	const adminToken = ctx.environment.get("ADMIN_TOKEN");
	if (!adminToken) throw new ForbiddenError();
	if (inputToken != adminToken) throw new ForbiddenError();
}
