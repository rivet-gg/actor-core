import type { ConnectionHandlers as ConnHandlers } from "./router-endpoints";
import type { Context as HonoContext, HonoRequest } from "hono";

/**
 * Deterines how requests to actors should be routed.
 *
 * Inline handlers calls the connection handlers directly.
 *
 * Custom will let a custom function handle the request. This usually will proxy the request to another location.
 */
export type ConnRoutingHandler =
	| {
			inline: {
				handlers: ConnHandlers;
			};
	  }
	| {
			custom: ConnRoutingHandlerCustom;
	  };

export interface ConnRoutingHandlerCustom {
	sendRequest: SendRequestHandler;
	openWebSocket: OpenWebSocketHandler;
	proxyRequest: ProxyRequestHandler;
	proxyWebSocket: ProxyWebSocketHandler;
}

export type BuildProxyEndpoint = (c: HonoContext, actorId: string) => string;

export type SendRequestHandler = (
	actorId: string,
	meta: unknown | undefined,
	actorRequest: Request,
) => Promise<Response>;

export type OpenWebSocketHandler = (
	actorId: string,
	meta?: unknown,
) => Promise<WebSocket>;

export type ProxyRequestHandler = (
	c: HonoContext,
	actorRequest: Request,
	actorId: string,
	meta?: unknown,
) => Promise<Response>;

export type ProxyWebSocketHandler = (
	c: HonoContext,
	path: string,
	actorId: string,
	meta?: unknown,
) => Promise<Response>;
