import { z } from "zod";
import { BackendLocalDevelopmentConfigSchema } from "./utils/lobby/backend/local_development";
import { BackendRivetConfigSchema, RivetConfigSchema } from "./utils/lobby/backend/rivet";
import { BackendTestConfigSchema } from "./utils/lobby/backend/test";

export const PlayerRangeSchema = z.object({
	min: z.number(),
	max: z.number(),
});
export type PlayerRange = z.infer<typeof PlayerRangeSchema>;

export const LobbyBackendSchema = z.union([
	z.object({ test: BackendTestConfigSchema }),
	z.object({ localDevelopment: BackendLocalDevelopmentConfigSchema }),
	z.object({ rivet: BackendRivetConfigSchema }),
]);
export type LobbyBackend = z.infer<typeof LobbyBackendSchema>;

export const LobbyConfigSchema = z.object({
	regions: z.array(z.string()).default(["atl", "fra"]),
	destroyOnEmptyAfter: z.number().nullable().optional().default(60000),
	unreadyExpireAfter: z.number().default(300000),
	maxPlayers: z.number().default(16),
	maxPlayersDirect: z.number().default(16),
	enableDynamicMaxPlayers: PlayerRangeSchema.optional(),
	enableDynamicMaxPlayersDirect: PlayerRangeSchema.optional(),
	enableCreate: z.boolean().default(false),
	enableDestroy: z.boolean().default(false),
	enableFind: z.boolean().default(true),
	enableFindOrCreate: z.boolean().default(true),
	enableJoin: z.boolean().default(true),
	enableList: z.boolean().default(true),
	backend: LobbyBackendSchema,
});
export type LobbyConfig = z.infer<typeof LobbyConfigSchema>;

export const LobbyRuleSchema = z.object({
	tags: z.record(z.string(), z.string()),
	config: LobbyConfigSchema.partial(),
});
export type LobbyRule = z.infer<typeof LobbyRuleSchema>;

export const AdminSchema = z.object({
	token: z.string(),
});

export const ConfigSchema = z.object({
	tickInterval: z.number().default(1000),
	gcInterval: z.number().default(15 * 1000),
	pollServersInterval: z.number().default(1000),
	lobbies: LobbyConfigSchema,
	lobbyRules: z.array(LobbyRuleSchema).default([]),
	players: z.object({
		maxPerIp: z.number().optional().default(8),
		maxUnconnected: z.number().optional().default(128),
		unconnectedExpireAfter: z.number().default(60000),
		autoDestroyAfter: z.number().optional().default(4147200000),
	}),
	admin: AdminSchema.optional(),
	rivet: RivetConfigSchema.optional(),
});
export type Config = z.infer<typeof ConfigSchema>;
export type InputConfig = z.input<typeof ConfigSchema>;
