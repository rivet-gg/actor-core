import type { AnyActorInstance } from "./instance";
import type { Conn } from "./connection";
import type { Logger } from "@/common/log";
import type { ActorTags } from "@/common/utils";
import type { Schedule } from "./schedule";
import type { ConnId } from "./connection";
import type { SaveStateOptions } from "./instance";
import { ActorContext } from "./context";
import { SqlConnection } from "@/actor/sql/mod";

/**
 * Context for a remote procedure call.
 *
 * @typeParam A Actor this action belongs to
 */
export class ActionContext<S, CP, CS, V> {
	#actorContext: ActorContext<S, CP, CS, V>;

	/**
	 * Should not be called directly.
	 *
	 * @param actorContext - The actor context
	 * @param conn - The connection associated with the action
	 */
	constructor(
		actorContext: ActorContext<S, CP, CS, V>,
		public readonly conn: Conn<S, CP, CS, V>,
	) {
		this.#actorContext = actorContext;
	}

	/**
	 * Get the actor state
	 */
	get state(): S {
		return this.#actorContext.state;
	}

	get sql(): SqlConnection {
		return this.#actorContext.sql
	}

	/**
	 * Get the actor variables
	 */
	get vars(): V {
		return this.#actorContext.vars;
	}

	/**
	 * Broadcasts an event to all connected clients.
	 */
	broadcast(name: string, ...args: any[]): void {
		this.#actorContext.broadcast(name, ...args);
	}

	/**
	 * Gets the logger instance.
	 */
	get log(): Logger {
		return this.#actorContext.log;
	}

	/**
	 * Gets the actor name.
	 */
	get name(): string {
		return this.#actorContext.name;
	}

	/**
	 * Gets the actor tags.
	 */
	get tags(): ActorTags {
		return this.#actorContext.tags;
	}

	/**
	 * Gets the region.
	 */
	get region(): string {
		return this.#actorContext.region;
	}

	/**
	 * Gets the scheduler.
	 */
	get schedule(): Schedule {
		return this.#actorContext.schedule;
	}

	/**
	 * Gets the map of connections.
	 */
	get conns(): Map<ConnId, Conn<S, CP, CS, V>> {
		return this.#actorContext.conns;
	}

	/**
	 * Forces the state to get saved.
	 */
	async saveState(opts: SaveStateOptions): Promise<void> {
		return this.#actorContext.saveState(opts);
	}

	/**
	 * Runs a promise in the background.
	 */
	runInBackground(promise: Promise<void>): void {
		return this.#actorContext.runInBackground(promise);
	}
}
