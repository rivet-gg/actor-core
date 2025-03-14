import { z } from "zod";
import type { RegionSchema } from "../../region.ts";

// MARK: Config
export const BackendTestConfigSchema = z.object({}).strict();
export type BackendTestConfig = z.infer<typeof BackendTestConfigSchema>;

// MARK: Response
export const LobbyBackendTestResponseSchema = z.object({}).strict();
export type LobbyBackendTestResponse = z.infer<
	typeof LobbyBackendTestResponseSchema
>;

export const REGIONS: z.infer<typeof RegionSchema>[] = [
	{
		slug: "test",
		name: "Test",
		latitude: 33.67727501667558,
		longitude: -106.47527637325621,
	},
];
