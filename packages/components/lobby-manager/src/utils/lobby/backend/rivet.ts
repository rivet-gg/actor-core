import { z } from "zod";
import type { RegionSchema } from "../../region";
import { type Rivet, RivetClient } from "@rivet-gg/api";
import { Config } from "@/config";
import { MissingRivetConfigError } from "@/errors";

// MARK: Config
export const RivetConfigSchema = z.object({
	//endpoint: z.string().default("https://api.rivet.gg"),
	token: z.string(),
	project: z.string(),
	environment: z.string(),
});
export type RivetConfig = z.infer<typeof RivetConfigSchema>;

export const BackendRivetConfigPortSchema = z.object({
	//protocol: z.custom<Rivet.actor.PortProtocol>(),
	protocol: z.custom<any>(),
	internalPort: z.number().optional(),
	//routing: z.custom<Rivet.actor.PortRouting>(),
	routing: z.custom<any>(),
});
export type BackendRivetConfigPort = z.infer<
	typeof BackendRivetConfigPortSchema
>;

export const BackendRivetConfigSchema = z.object({
	//resources: z.custom<Rivet.actor.Resources>(),
	resources: z.custom<any>(),
	environment: z.record(z.string(), z.string()).optional(),
	//networkMode: z.custom<Rivet.actor.NetworkMode>(),
	networkMode: z.custom<any>(),
	ports: z.record(z.string(), BackendRivetConfigPortSchema),
});
export type BackendRivetConfig = z.infer<typeof BackendRivetConfigSchema>;

// MARK: Response
export const LobbyBackendRivetPortResponseSchema = z.object({
	//protocol: z.custom<Rivet.actor.PortProtocol>(),
	protocol: z.custom<any>(),
	internalPort: z.number().optional(),
	hostname: z.string().optional(),
	port: z.number().optional(),
	//routing: z.custom<Rivet.actor.PortRouting>(),
	routing: z.custom<any>(),
});
export type LobbyBackendRivetPortResponse = z.infer<
	typeof LobbyBackendRivetPortResponseSchema
>;

export const LobbyBackendRivetResponseSchema = z.object({
	serverId: z.string(),
	ports: z.record(z.string(), LobbyBackendRivetPortResponseSchema).optional(),
});
export type LobbyBackendRivetResponse = z.infer<
	typeof LobbyBackendRivetResponseSchema
>;

// TODO: Return dynamic regions instead of hardcoded
export const REGIONS: z.infer<typeof RegionSchema>[] = [
	{
		slug: "atl",
		name: "Atlanta",
		latitude: 33.749,
		longitude: -84.388,
	},
	{
		slug: "lax",
		name: "Los Angeles",
		latitude: 34.0522,
		longitude: -118.2437,
	},
	{
		slug: "fra",
		name: "Frankfurt",
		latitude: 50.1109,
		longitude: 8.6821,
	},
	{
		slug: "syd",
		name: "Sydney",
		latitude: -33.8688,
		longitude: 151.2093,
	},
	{
		slug: "osa",
		name: "Osaka",
		latitude: 34.6937,
		longitude: 135.5023,
	},
	{
		slug: "gru",
		name: "São Paulo",
		latitude: -23.5505,
		longitude: -46.6333,
	},
	{
		slug: "bom",
		name: "Mumbai",
		latitude: 19.076,
		longitude: 72.8777,
	},
	{
		slug: "sin",
		name: "Singapore",
		latitude: 1.3521,
		longitude: 103.8198,
	},

	{
		slug: "lnd-atl",
		name: "Atlanta",
		latitude: 33.749,
		longitude: -84.388,
	},
	{
		slug: "lnd-fra",
		name: "Frankfurt",
		latitude: 50.1109,
		longitude: 8.6821,
	},
];

export function createRivetClient(config: Config, region?: string): {
	client: RivetClient;
	project: string;
	environment: string;
} {
	if (!config.rivet) throw new MissingRivetConfigError();
	const client = new RivetClient({
		// TODO: add dynamic region endpoints in config, but we need to be able to get the endpoint for each config
		environment: region ? `https://api.${region}.rivet.gg` : "https://api.rivet.gg",
		token: config.rivet.token,
	});
	return {
		client,
		project: config.rivet.project,
		environment: config.rivet.environment,
	};
}
