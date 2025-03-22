import deepmerge from "deepmerge";
import type { Config, LobbyConfig } from "../config";
import { lobbyTagsMatch } from "./lobby/mod";

export function getLobbyConfig(
	userConfig: Config,
	lobbyTags: Record<string, string>,
): LobbyConfig {
	let lobbyConfig = userConfig.lobbies;

	// Apply rules
	for (const rule of userConfig.lobbyRules) {
		if (lobbyTagsMatch(rule.tags, lobbyTags)) {
			lobbyConfig = deepmerge<LobbyConfig>(lobbyConfig, rule.config);
		}
	}

	return lobbyConfig;
}

/**
 * If lobbies can be created and destroyed.
 *
 * In some cases, there are a fixed number of lobbies.
 */
export function canMutateLobbies(lobbyConfig: LobbyConfig): boolean {
	return !("localDevelopment" in lobbyConfig.backend);
}

/**
 * If lobby config requires lobby token.
 */
export function requiresLobbyToken(lobbyConfig: LobbyConfig): boolean {
	return !("localDevelopment" in lobbyConfig.backend);
}

/**
 * If lobby can call ready multiple times.
 */
export function canCallLobbyReadyMultipleTimes(
	lobbyConfig: LobbyConfig,
): boolean {
	return "localDevelopment" in lobbyConfig.backend;
}

/**
 * If any region is accepted.
 */
export function acceptAnyRegion(lobbyConfig: LobbyConfig): boolean {
	return "localDevelopment" in lobbyConfig.backend;
}

/**
 * If any version is accepted.
 */
export function acceptAnyVersion(lobbyConfig: LobbyConfig): boolean {
	return "localDevelopment" in lobbyConfig.backend;
}
