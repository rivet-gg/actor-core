import type { ConnRoutingHandler } from "@/actor/conn-routing-handler";
import type { ActorKey } from "@/actor/mod";
import type { ManagerInspector } from "@/inspector/manager";
import type { RegistryConfig } from "@/registry/config";
import type { Env, Hono, Context as HonoContext } from "hono";

export interface ManagerDriver {
	getForId(input: GetForIdInput): Promise<ActorOutput | undefined>;
	getWithKey(input: GetWithKeyInput): Promise<ActorOutput | undefined>;
	getOrCreateWithKey(input: GetOrCreateWithKeyInput): Promise<ActorOutput>;
	createActor(input: CreateInput): Promise<ActorOutput>;

	readonly connRoutingHandler?: ConnRoutingHandler;

	modifyManagerRouter?: (registryConfig: RegistryConfig, router: Hono) => void;

	readonly inspector?: ManagerInspector;
}
export interface GetForIdInput<E extends Env = any> {
	c?: HonoContext | undefined;
	actorId: string;
}

export interface GetWithKeyInput<E extends Env = any> {
	c?: HonoContext | undefined;
	name: string;
	key: ActorKey;
}

export interface GetOrCreateWithKeyInput<E extends Env = any> {
	c?: HonoContext | undefined;
	name: string;
	key: ActorKey;
	input?: unknown;
	region?: string;
}

export interface CreateInput<E extends Env = any> {
	c?: HonoContext | undefined;
	name: string;
	key: ActorKey;
	input?: unknown;
	region?: string;
}

export interface ActorOutput {
	actorId: string;
	name: string;
	key: ActorKey;
}
