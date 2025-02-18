import { CreateRequest } from "@/client/mod";
import { ActorTags, Connection } from "./mod";
import type * as messageToClient from "@/actor/protocol/message/to_client";
import { CachedSerializer } from "@/actor/protocol/serde";
import { AnyActor } from "./actor";

export type ConnectionDrivers = Record<string, ConnectionDriver>;

export interface GetActorOutput {
	endpoint: string;
}

export interface ManagerDriver {
	getForId(actorId: string): Promise<GetActorOutput>;
	getWithTags(tags: ActorTags): Promise<GetActorOutput | undefined>;
	createActor(req: CreateRequest): Promise<GetActorOutput>;
}

export interface ActorDriver {
	//load(): Promise<LoadOutput>;

	// HACK: Clean these up
	kvGet(actorId: string, key: any): Promise<any>;
	kvGetBatch(actorId: string, key: any[]): Promise<[any, any][]>;
	kvPut(actorId: string, key: any, value: any): Promise<void>;
	kvPutBatch(actorId: string, key: [any, any][]): Promise<void>;
	kvDelete(actorId: string, key: any): Promise<void>;
	kvDeleteBatch(actorId: string, key: any[]): Promise<void>;

	// Schedule
	setAlarm(actorId: string, timestamp: number): Promise<void>;

	// TODO:
	//destroy(): Promise<void>;
	//readState(): void;
}

export interface ConnectionDriver<ConnDriverState = unknown> {
	sendMessage(
		actor: AnyActor,
		conn: Connection<AnyActor>,
		state: ConnDriverState,
		message: CachedSerializer<messageToClient.ToClient>,
	): void;

	/**
	 * This returns a promise since we commonly disconnect at the end of a program, and not waiting will cause the socket to not close cleanly.
	 */
	disconnect(
		actor: AnyActor,
		conn: Connection<AnyActor>,
		state: ConnDriverState,
		reason?: string,
	): Promise<void>;
}
