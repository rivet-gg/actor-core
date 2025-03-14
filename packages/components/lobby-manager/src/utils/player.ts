export type PlayerRequest = Record<never, never>;

export interface PlayerResponse {
	id: string;
}

export interface PlayerResponseWithToken extends PlayerResponse {
	token: string;
}
