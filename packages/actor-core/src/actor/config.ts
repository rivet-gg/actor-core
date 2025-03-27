import type { Conn } from "./connection";
import type { ActionContext } from "./action";
import type { ActorContext } from "./context";
import { z } from "zod";

// This schema is used to validate the input at runtime. The generic types are defined below in `ActorConfig`.
//
// We don't use Zod generics with `z.custom` because:
// (a) there seems to be a weird bug in either Zod, tsup, or TSC that causese external packages to have different types from `z.infer` than from within the same package and
// (b) it makes the type definitions incredibly difficult to read as opposed to vanilla TypeScript.
export const ActorConfigSchema = z
	.object({
		onCreate: z.function().optional(),
		onStart: z.function().optional(),
		onStateChange: z.function().optional(),
		onBeforeConnect: z.function().optional(),
		onConnect: z.function().optional(),
		onDisconnect: z.function().optional(),
		onBeforeActionResponse: z.function().optional(),
		actions: z.record(z.function()),
		state: z.any().optional(),
		sql: z.boolean().default(false),
		createState: z.function().optional(),
		connState: z.any().optional(),
		createConnState: z.function().optional(),
		vars: z.any().optional(),
		createVars: z.function().optional(),
		options: z
			.object({
				state: z
					.object({
						saveInterval: z.number().positive().default(10_000),
					})
					.strict()
					.default({}),
				action: z
					.object({
						timeout: z.number().positive().default(60_000),
					})
					.strict()
					.default({}),
			})
			.strict()
			.default({}),
	})
	.strict()
	.refine(
		(data) => !(data.state !== undefined && data.createState !== undefined),
		{
			message: "Cannot define both 'state' and 'createState'",
			path: ["state"],
		},
	)
	.refine(
		(data) =>
			!(data.connState !== undefined && data.createConnState !== undefined),
		{
			message: "Cannot define both 'connState' and 'createConnState'",
			path: ["connState"],
		},
	)
	.refine(
		(data) => !(data.vars !== undefined && data.createVars !== undefined),
		{
			message: "Cannot define both 'vars' and 'createVars'",
			path: ["vars"],
		},
	);

export interface OnConnectOptions<CP> {
	/**
	 * The request object associated with the connection.
	 *
	 * @experimental
	 */
	request?: Request;
	params: CP;
}

// Creates state config
//
// This must have only one or the other or else S will not be able to be inferred
type CreateState<S, CP, CS, V> =
	| { state: S }
	| {
			createState: (
				c: ActorContext<undefined, undefined, undefined, undefined>,
			) => S | Promise<S>;
	  }
	| Record<never, never>;

// Creates connection state config
//
// This must have only one or the other or else S will not be able to be inferred
type CreateConnState<S, CP, CS, V> =
	| { connState: CS }
	| {
			createConnState: (
				c: ActorContext<undefined, undefined, undefined, undefined>,
				opts: OnConnectOptions<CP>,
			) => CS | Promise<CS>;
	  }
	| Record<never, never>;

// Creates vars config
//
// This must have only one or the other or else S will not be able to be inferred
/**
 * @experimental
 */
type CreateVars<S, CP, CS, V> =
	| {
			/**
			 * @experimental
			 */
			vars: V;
	  }
	| {
			/**
			 * @experimental
			 */
			createVars: (
				c: ActorContext<undefined, undefined, undefined, undefined>,
				driverCtx: unknown,
			) => V | Promise<V>;
	  }
	| Record<never, never>;

export interface Actions<S, CP, CS, V> {
	[Action: string]: (c: ActionContext<S, CP, CS, V>, ...args: any[]) => any;
}

//export type ActorConfig<S, CP, CS, V> = BaseActorConfig<S, CP, CS, V> &
//	ActorConfigLifecycle<S, CP, CS, V> &
//	CreateState<S, CP, CS, V> &
//	CreateConnState<S, CP, CS, V>;

interface BaseActorConfig<S, CP, CS, V, R extends Actions<S, CP, CS, V>> {
	/**
	 * Called when the actor is first initialized.
	 *
	 * Use this hook to initialize your actor's state.
	 * This is called before any other lifecycle hooks.
	 */
	onCreate?: (c: ActorContext<S, CP, CS, V>) => void | Promise<void>;

	/**
	 * Called when the actor is started and ready to receive connections and action.
	 *
	 * Use this hook to initialize resources needed for the actor's operation
	 * (timers, external connections, etc.)
	 *
	 * @returns Void or a Promise that resolves when startup is complete
	 */
	onStart?: (c: ActorContext<S, CP, CS, V>) => void | Promise<void>;

	/**
	 * Called when the actor's state changes.
	 *
	 * Use this hook to react to state changes, such as updating
	 * external systems or triggering events.
	 *
	 * @param newState The updated state
	 */
	onStateChange?: (c: ActorContext<S, CP, CS, V>, newState: S) => void;

	/**
	 * Called before a client connects to the actor.
	 *
	 * Use this hook to determine if a connection should be accepted
	 * and to initialize connection-specific state.
	 *
	 * @param opts Connection parameters including client-provided data
	 * @returns The initial connection state or a Promise that resolves to it
	 * @throws Throw an error to reject the connection
	 */
	onBeforeConnect?: (
		c: ActorContext<S, CP, CS, V>,
		opts: OnConnectOptions<CP>,
	) => void | Promise<void>;

	/**
	 * Called when a client successfully connects to the actor.
	 *
	 * Use this hook to perform actions when a connection is established,
	 * such as sending initial data or updating the actor's state.
	 *
	 * @param conn The connection object
	 * @returns Void or a Promise that resolves when connection handling is complete
	 */
	onConnect?: (
		c: ActorContext<S, CP, CS, V>,
		conn: Conn<S, CP, CS, V>,
	) => void | Promise<void>;

	/**
	 * Called when a client disconnects from the actor.
	 *
	 * Use this hook to clean up resources associated with the connection
	 * or update the actor's state.
	 *
	 * @param conn The connection that is being closed
	 * @returns Void or a Promise that resolves when disconnect handling is complete
	 */
	onDisconnect?: (
		c: ActorContext<S, CP, CS, V>,
		conn: Conn<S, CP, CS, V>,
	) => void | Promise<void>;

	/**
	 * Called before sending an action response to the client.
	 *
	 * Use this hook to modify or transform the output of an action before it's sent
	 * to the client. This is useful for formatting responses, adding metadata,
	 * or applying transformations to the output.
	 *
	 * @param name The name of the action that was called
	 * @param args The arguments that were passed to the action
	 * @param output The output that will be sent to the client
	 * @returns The modified output to send to the client
	 */
	onBeforeActionResponse?: <Out>(
		c: ActorContext<S, CP, CS, V>,
		name: string,
		args: unknown[],
		output: Out,
	) => Out | Promise<Out>;

	actions: R;
}

// 1. Infer schema
// 2. Omit keys that we'll manually define (because of generics)
// 3. Define our own types that have generic constraints
export type ActorConfig<S, CP, CS, V> = Omit<
	z.infer<typeof ActorConfigSchema>,
	| "actions"
	| "onCreate"
	| "onStart"
	| "onStateChange"
	| "onBeforeConnect"
	| "onConnect"
	| "onDisconnect"
	| "onBeforeActionResponse"
	| "state"
	| "createState"
	| "connState"
	| "createConnState"
	| "vars"
	| "createVars"
> &
	BaseActorConfig<S, CP, CS, V, Actions<S, CP, CS, V>> &
	CreateState<S, CP, CS, V> &
	CreateConnState<S, CP, CS, V> &
	CreateVars<S, CP, CS, V>;

// See description on `ActorConfig`
export type ActorConfigInput<
	S,
	CP,
	CS,
	V,
	R extends Actions<S, CP, CS, V>,
> = Omit<
	z.input<typeof ActorConfigSchema>,
	| "actions"
	| "onCreate"
	| "onStart"
	| "onStateChange"
	| "onBeforeConnect"
	| "onConnect"
	| "onDisconnect"
	| "onBeforeActionResponse"
	| "state"
	| "createState"
	| "connState"
	| "createConnState"
	| "vars"
	| "createVars"
> &
	BaseActorConfig<S, CP, CS, V, R> &
	CreateState<S, CP, CS, V> &
	CreateConnState<S, CP, CS, V> &
	CreateVars<S, CP, CS, V>;

// For testing type definitions:
export function test<S, CP, CS, V, R extends Actions<S, CP, CS, V>>(
	input: ActorConfigInput<S, CP, CS, V, R>,
): ActorConfig<S, CP, CS, V> {
	const config = ActorConfigSchema.parse(input) as ActorConfig<S, CP, CS, V>;
	return config;
}

export const testActor = test({
	state: { count: 0 },
	// createState: () => ({ count: 0 }),
	actions: {
		increment: (c, x: number) => {
			c.state.count += x;
			c.broadcast("newCount", c.state.count);
			return c.state.count;
		},
	},
});
