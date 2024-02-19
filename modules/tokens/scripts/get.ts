import { ScriptContext } from "@ogs/helpers/tokens/scripts/get.ts";
import { Token } from "../types/common.ts";
import { tokenFromRow } from "../types/common.ts";

export interface Request {
	tokenIds: string[];
}

export interface Response {
	tokens: Token[];
}

export async function handler(
	ctx: ScriptContext,
	req: Request,
): Promise<Response> {
	const rows = await ctx.db.token.findMany({
		where: {
			id: { in: req.tokenIds },
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	const tokens = rows.map(tokenFromRow);

	return { tokens };
}
