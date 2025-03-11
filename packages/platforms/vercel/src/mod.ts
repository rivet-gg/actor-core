import { createRouter } from "@actor-core/redis";
import type { Config } from "./config";
import type { NextRequest } from "next/server";

export function createHandler(config: Config) {
	const app = createRouter(config, {
		// Vercel doesn't need WebSocket upgrade handling as it's handled differently
		getUpgradeWebSocket: undefined,
	});

	return {
		GET: async (request: NextRequest) => {
			return app.fetch(request);
		},
		POST: async (request: NextRequest) => {
			return app.fetch(request);
		},
		PUT: async (request: NextRequest) => {
			return app.fetch(request);
		},
		DELETE: async (request: NextRequest) => {
			return app.fetch(request);
		},
		PATCH: async (request: NextRequest) => {
			return app.fetch(request);
		},
		HEAD: async (request: NextRequest) => {
			return app.fetch(request);
		},
		OPTIONS: async (request: NextRequest) => {
			return app.fetch(request);
		},
	};
}
