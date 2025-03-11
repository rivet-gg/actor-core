import { z } from "zod";
import type { LobbyResponse } from "../lobby/mod";
import type { PlayerResponseWithToken } from "../player";
import { MalformedRequestError } from "@/errors";

/**
 * Helper function to parse and validate request input
 * @param schema The zod schema to validate with
 * @param input The input data to validate
 * @returns The validated data
 * @throws Error if validation fails
 */
export function parseRequest<T extends z.ZodType>(
	schema: T,
	input: unknown,
): z.infer<T> {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new MalformedRequestError({ message: result.error.message });
	}
	return result.data;
}

/**
 * Common response type used for create/find/join requests.
 */
interface BaseLobbyResponse {
	lobby: LobbyResponse;
	players: PlayerResponseWithToken[];
}

// MARK: Common Schemas
export const PlayerRequestSchema = z.record(z.never());
export type PlayerRequest = z.infer<typeof PlayerRequestSchema>;

export const QueryRequestSchema = z.object({
	/**
	 * Version is required in query in order to correctly match the client to the
	 * correct server version.
	 */
	version: z.string(),
	regions: z.array(z.string()).optional(),
	tags: z.record(z.string()).optional(),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const LobbyRequestSchema = z.object({
	version: z.string(),
	region: z.string(),
	tags: z.record(z.string()).optional(),
	maxPlayers: z.number().int().positive(),
	maxPlayersDirect: z.number().int().positive(),
});
export type LobbyRequest = z.infer<typeof LobbyRequestSchema>;

// MARK: Create Lobby
export const CreateLobbyRequestSchema = z.object({
	lobby: LobbyRequestSchema,
	players: z.array(PlayerRequestSchema),
	noWait: z.boolean(),
});
export type CreateLobbyRequest = z.infer<typeof CreateLobbyRequestSchema>;
export type CreateLobbyRequestInput = CreateLobbyRequest;

export type CreateLobbyResponse = BaseLobbyResponse;

// MARK: Find Lobby
export const FindLobbyRequestSchema = z.object({
	query: QueryRequestSchema,
	players: z.array(PlayerRequestSchema),
	noWait: z.boolean(),
});
export type FindLobbyRequest = z.infer<typeof FindLobbyRequestSchema>;
export type FindLobbyRequestInput = FindLobbyRequest;

export type FindLobbyResponse = BaseLobbyResponse;

// MARK: Find or Create
export const FindOrCreateLobbyRequestSchema = z.object({
	query: QueryRequestSchema,
	lobby: LobbyRequestSchema,
	players: z.array(PlayerRequestSchema),
	noWait: z.boolean(),
});
export type FindOrCreateLobbyRequest = z.infer<
	typeof FindOrCreateLobbyRequestSchema
>;
export type FindOrCreateLobbyRequestInput = FindOrCreateLobbyRequest;

export type FindOrCreateLobbyResponse = BaseLobbyResponse;

// MARK: Set Lobby Ready
export const SetLobbyReadyRequestSchema = z
	.object({
		lobbyId: z.string().uuid().optional(),
		lobbyToken: z.string().optional(),
	});
export type SetLobbyReadyRequest = z.infer<typeof SetLobbyReadyRequestSchema>;
export type SetLobbyReadyRequestInput = SetLobbyReadyRequest;

// MARK: List Lobbies
export const ListLobbiesRequestSchema = QueryRequestSchema;
export type ListLobbiesRequest = z.infer<typeof ListLobbiesRequestSchema>;
export type ListLobbiesRequestInput = ListLobbiesRequest;

export interface ListLobbiesResponse {
	lobbies: LobbyResponse[];
}

// MARK: Create Players
export const JoinLobbyRequestSchema = z.object({
	lobbyId: z.string().uuid(),
	players: z.array(PlayerRequestSchema),
	noWait: z.boolean(),
});
export type JoinLobbyRequest = z.infer<typeof JoinLobbyRequestSchema>;
export type JoinLobbyRequestInput = JoinLobbyRequest;

export type JoinLobbyResponse = BaseLobbyResponse;

// MARK: Set Players Disconnected
export const SetPlayersDisconnectedSchema = z
	.object({
		lobbyId: z.string().uuid().optional(),
		lobbyToken: z.string().optional(),
		playerTokens: z.array(z.string()),
	});
export type SetPlayersDisconnected = z.infer<
	typeof SetPlayersDisconnectedSchema
>;
export type SetPlayersDisconnectedInput = SetPlayersDisconnected;

// MARK: Set Players Connected
export const SetPlayersConnectedRequestSchema = z
	.object({
		lobbyId: z.string().uuid().optional(),
		lobbyToken: z.string().optional(),
		playerTokens: z.array(z.string()),
	});
export type SetPlayersConnectedRequest = z.infer<
	typeof SetPlayersConnectedRequestSchema
>;
export type SetPlayersConnectedRequestInput = SetPlayersConnectedRequest;

// MARK: Admin
export const AdminDestroyLobbyRequestSchema = z.object({
	adminToken: z.string(),
	lobbyId: z.string().uuid(),
	reason: z.string().optional(),
});
export type AdminDestroyLobbyRequest = z.infer<
	typeof AdminDestroyLobbyRequestSchema
>;
export type AdminDestroyLobbyRequestInput = AdminDestroyLobbyRequest;

export const AdminGetLobbyTokenSchema = z.object({
	adminToken: z.string(),
	lobbyId: z.string().uuid(),
});
export type AdminGetLobbyToken = z.infer<typeof AdminGetLobbyTokenSchema>;
export type AdminGetLobbyTokenInput = AdminGetLobbyToken;
