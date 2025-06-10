import { z } from "zod";

export const ResolveResponseSchema = z.object({
	// Worker ID
	i: z.string(),
});

export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;
