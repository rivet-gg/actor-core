import type { ActorDriver, AnyActorInstance } from "actor-core/driver-helpers";
import type { FileSystemGlobalState } from "./global_state";

export type ActorDriverContext = Record<never, never>;

/**
 * File System implementation of the Actor Driver
 */
export class FileSystemActorDriver implements ActorDriver {
    #state: FileSystemGlobalState;
    
    constructor(state: FileSystemGlobalState) {
        this.#state = state;
    }
    
    /**
     * Get the current storage directory path
     */
    get storagePath(): string {
        return this.#state.storagePath;
    }

    getContext(_actorId: string): ActorDriverContext {
        return {};
    }

    async readPersistedData(actorId: string): Promise<unknown | undefined> {
        return this.#state.readPersistedData(actorId);
    }

    async writePersistedData(actorId: string, data: unknown): Promise<void> {
        this.#state.writePersistedData(actorId, data);
        
        // Save state to disk
        await this.#state.saveActorState(actorId);
    }

    async setAlarm(actor: AnyActorInstance, timestamp: number): Promise<void> {
        const delay = Math.max(0, timestamp - Date.now());
        setTimeout(() => {
            actor.onAlarm();
        }, delay);
    }

    async getAlarm(actor: AnyActorInstance): Promise<number | null> {
        throw new Error("Method not implemented.");
    }

    async deleteAlarm(actor: AnyActorInstance): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
