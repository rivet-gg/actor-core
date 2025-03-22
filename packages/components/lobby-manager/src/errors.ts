import { UserError } from "actor-core/errors";

export class MalformedRequestError extends UserError {
	constructor(metadata: unknown) {
		super("Malformed request.", {
			code: "malformed_request",
			metadata,
		});
	}
}

export class LobbyNotFoundError extends UserError {
	constructor(metadata: unknown) {
		super("Lobby not found.", {
			code: "lobby_not_found",
			metadata,
		});
	}
}

export class LobbyAbortedError extends UserError {
	constructor(metadata: unknown) {
		super("Lobby stopped while attempting to join.", {
			code: "lobby_aborted",
			metadata,
		});
	}
}

export class LobbyCreateMissingPlayersError extends UserError {
	constructor() {
		super(
			"When creating a lobby with `config.lobbies.autoDestroyWhenEmpty`, a lobby must be created with players in order to avoid creating an empty lobby.",
			{
				code: "lobby_create_missing_players",
			},
		);
	}
}

export class LobbyFullError extends UserError {
	constructor(metadata: unknown) {
		super("No more players can join this lobby.", {
			code: "lobby_full",
			metadata,
		});
	}
}

export class MorePlayersThanMaxError extends UserError {
	constructor() {
		super(
			"More players were passed to the create lobby than the number of max players in a lobby.",
			{
				code: "more_players_than_max",
			},
		);
	}
}

export class LobbyAlreadyReadyError extends UserError {
	constructor() {
		super("Lobby already set as ready.", {
			code: "lobby_already_ready",
		});
	}
}

export class PlayerAlreadyConnectedError extends UserError {
	constructor(metadata: unknown) {
		super(
			"The player has already connected to this server. This error helps mitigate botting attacks by only allowing one socket to connect to a game server for every player.",
			{
				code: "player_already_connected",
				metadata,
			},
		);
	}
}

export class PlayerDisconnectedError extends UserError {
	constructor(metadata: unknown) {
		super(
			"The player has already disconnected from the server. Create a new player for the specified lobby using the `join` script.",
			{
				code: "player_disconnected",
				metadata,
			},
		);
	}
}

export class NoMatchingLobbiesError extends UserError {
	constructor(metadata: unknown) {
		super("No lobbies matched the given query.", {
			code: "no_matching_lobbies",
			metadata,
		});
	}
}

export class TooManyPlayersForIpError extends UserError {
	constructor(metadata: unknown) {
		super("The player has too many existing players for the given IP.", {
			code: "too_many_players_for_ip",
			metadata,
		});
	}
}

export class CannotMutateLobbiesError extends UserError {
	constructor() {
		super("This backend doesn't let you create or destroy lobbies.", {
			code: "cannot_mutate_lobbies",
		});
	}
}

export class LobbyTokenRequiredError extends UserError {
	constructor() {
		super("A lobby token was not provided when required for authentication.", {
			code: "lobby_token_required",
		});
	}
}

export class LobbyTokenInvalidError extends UserError {
	constructor() {
		super("Provided lobby token does not match any running lobbies.", {
			code: "lobby_token_invalid",
		});
	}
}

export class PlayerTokenInvalidError extends UserError {
	constructor() {
		super("Provided player token does not match any active players.", {
			code: "player_token_invalid",
		});
	}
}

export class RegionNotFoundError extends UserError {
	constructor(metadata: unknown) {
		super("Region not found.", {
			code: "region_not_found",
			metadata,
		});
	}
}

export class ForbiddenError extends UserError {
	constructor() {
		super("Cannot access this command.", {
			code: "forbidden",
		});
	}
}

export class MissingRivetConfigError extends UserError {
	constructor() {
		super(
			"Missing Rivet config. Cannot access API without token, project, and environment.",
			{
				code: "missing_rivet_config",
			},
		);
	}
}
