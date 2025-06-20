import type { AnyActorDefinition } from "@/actor/definition";
import type { ActionRequest, ActionResponse } from "@/actor/protocol/http/action";
import type { Encoding } from "@/actor/protocol/serde";
import type { ActorQuery } from "@/manager/protocol/query";
import { type ActorDefinitionActions, resolveActorId } from "./actor-common";
import { type ActorConn, ActorConnRaw } from "./actor-conn";
import { CREATE_ACTOR_CONN_PROXY, type ClientRaw } from "./client";
import { logger } from "./log";
import { sendHttpRequest } from "./utils";
import invariant from "invariant";
import { assertUnreachable } from "@/actor/utils";
import {
	HEADER_ACTOR_QUERY,
	HEADER_CONN_PARAMS,
	HEADER_ENCODING,
} from "@/actor/router-endpoints";

/**
 * Provides underlying functions for stateless {@link ActorHandle} for action calls.
 * Similar to ActorConnRaw but doesn't maintain a connection.
 *
 * @see {@link ActorHandle}
 */
export class ActorHandleRaw {
	#client: ClientRaw;
	#endpoint: string;
	#encodingKind: Encoding;
	#actorQuery: ActorQuery;

	/**
	 * Do not call this directly.
	 *
	 * Creates an instance of ActorHandleRaw.
	 *
	 * @param {string} endpoint - The endpoint to connect to.
	 *
	 * @protected
	 */
	public constructor(
		client: any,
		endpoint: string,
		private readonly params: unknown,
		encodingKind: Encoding,
		actorQuery: ActorQuery,
	) {
		this.#client = client;
		this.#endpoint = endpoint;
		this.#encodingKind = encodingKind;
		this.#actorQuery = actorQuery;
	}

	/**
	 * Call a raw action. This method sends an HTTP request to invoke the named action.
	 *
	 * @see {@link ActorHandle}
	 * @template Args - The type of arguments to pass to the action function.
	 * @template Response - The type of the response returned by the action function.
	 * @param {string} name - The name of the action function to call.
	 * @param {...Args} args - The arguments to pass to the action function.
	 * @returns {Promise<Response>} - A promise that resolves to the response of the action function.
	 */
	async action<Args extends Array<unknown> = unknown[], Response = unknown>(
		name: string,
		...args: Args
	): Promise<Response> {
		logger().debug("actor handle action", {
			name,
			args,
			query: this.#actorQuery,
		});

		const responseData = await sendHttpRequest<ActionRequest, ActionResponse>({
			url: `${this.#endpoint}/actors/actions/${encodeURIComponent(name)}`,
			method: "POST",
			headers: {
				[HEADER_ENCODING]: this.#encodingKind,
				[HEADER_ACTOR_QUERY]: JSON.stringify(this.#actorQuery),
				...(this.params !== undefined
					? { [HEADER_CONN_PARAMS]: JSON.stringify(this.params) }
					: {}),
			},
			body: { a: args } satisfies ActionRequest,
			encoding: this.#encodingKind,
		});

		return responseData.o as Response;
	}

	/**
	 * Establishes a persistent connection to the actor.
	 *
	 * @template AD The actor class that this connection is for.
	 * @returns {ActorConn<AD>} A connection to the actor.
	 */
	connect(): ActorConn<AnyActorDefinition> {
		logger().debug("establishing connection from handle", {
			query: this.#actorQuery,
		});

		const conn = new ActorConnRaw(
			this.#client,
			this.#endpoint,
			this.params,
			this.#encodingKind,
			this.#actorQuery,
		);

		return this.#client[CREATE_ACTOR_CONN_PROXY](
			conn,
		) as ActorConn<AnyActorDefinition>;
	}

	/**
	 * Resolves the actor to get its unique actor ID
	 *
	 * @returns {Promise<string>} - A promise that resolves to the actor's ID
	 */
	async resolve(): Promise<string> {
		if (
			"getForKey" in this.#actorQuery ||
			"getOrCreateForKey" in this.#actorQuery
		) {
			const actorId = await resolveActorId(
				this.#endpoint,
				this.#actorQuery,
				this.#encodingKind,
			);
			this.#actorQuery = { getForId: { actorId } };
			return actorId;
		} else if ("getForId" in this.#actorQuery) {
			// SKip since it's already resolved
			return this.#actorQuery.getForId.actorId;
		} else if ("create" in this.#actorQuery) {
			// Cannot create a handle with this query
			invariant(false, "actorQuery cannot be create");
		} else {
			assertUnreachable(this.#actorQuery);
		}
	}
}

/**
 * Stateless handle to an actor. Allows calling actor's remote procedure calls with inferred types
 * without establishing a persistent connection.
 *
 * @example
 * ```
 * const room = client.get<ChatRoom>(...etc...);
 * // This calls the action named `sendMessage` on the `ChatRoom` actor without a connection.
 * await room.sendMessage('Hello, world!');
 * ```
 *
 * Private methods (e.g. those starting with `_`) are automatically excluded.
 *
 * @template AD The actor class that this handle is for.
 * @see {@link ActorHandleRaw}
 */
export type ActorHandle<AD extends AnyActorDefinition> = Omit<
	ActorHandleRaw,
	"connect"
> & {
	// Add typed version of ActorConn (instead of using AnyActorDefinition)
	connect(): ActorConn<AD>;
	// Resolve method returns the actor ID
	resolve(): Promise<string>;
} & ActorDefinitionActions<AD>;
