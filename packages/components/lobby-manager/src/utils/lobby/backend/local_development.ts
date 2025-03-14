import { z } from "zod";
import type * as State from "../../lobby_manager/state/v1";
import type { RegionSchema } from "../../region";

export const BackendLocalDevelopmentPortProtocolSchema = z.enum([
	"http",
	"tcp",
	"udp",
]);
export type BackendLocalDevelopmentPortProtocol = z.infer<
	typeof BackendLocalDevelopmentPortProtocolSchema
>;

// MARK: Config
export const BackendLocalDevelopmentConfigPortSchema = z.object({
	protocol: BackendLocalDevelopmentPortProtocolSchema,
	hostname: z.string().optional(),
	port: z.number(),
});
export type BackendLocalDevelopmentConfigPort = z.infer<
	typeof BackendLocalDevelopmentConfigPortSchema
>;

export const BackendLocalDevelopmentConfigSchema = z.object({
	version: z.string().optional(),
	tags: z.record(z.string(), z.string()).optional(),
	maxPlayers: z.number().optional(),
	maxPlayersDirect: z.number().optional(),
	ports: z.record(z.string(), BackendLocalDevelopmentConfigPortSchema),
});
export type BackendLocalDevelopmentConfig = z.infer<
	typeof BackendLocalDevelopmentConfigSchema
>;

// MARK: Response
export const LobbyBackendLocalDevelopmentResponseSchema = z.object({
	ports: z.record(
		z.string(),
		z.custom<State.LobbyBackendLocalDevelopmentPort>(),
	),
});
export type LobbyBackendLocalDevelopmentResponse = z.infer<
	typeof LobbyBackendLocalDevelopmentResponseSchema
>;

export const REGIONS: z.infer<typeof RegionSchema>[] = [
	{
		slug: "local",
		name: "Local",
		latitude: 32.23233,
		longitude: -110.96167,
	},
];
