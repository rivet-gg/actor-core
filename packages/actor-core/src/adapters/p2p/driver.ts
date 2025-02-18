import type { ActorTags } from "@/common/utils";

export type NodeMessageCallback = (message: string) => void;

export interface GetActorLeaderOutput {
	initialized: boolean;
	nodeId: string;
}

export interface StartActorAndAcquireLeaseOutput {
	initialized: boolean;
	actorTags?: ActorTags;
	leaderNodeId?: string;
}

export interface ExtendLeaseOutput {
	leaseValid: boolean;
}

export interface AttemptAcquireLease {
	newLeaderNodeId: string;
}

export interface P2PDriver {
	// MARK: Node communication
	createNodeSubscriber(
		selfNodeId: string,
		callback: NodeMessageCallback,
	): Promise<void>;
	publishToNode(targetNodeId: string, message: string): Promise<void>;

	// MARK: Actor lifecycle
	getActorLeader(actorId: string): Promise<GetActorLeaderOutput>;
	startActorAndAcquireLease(
		actorId: string,
		selfNodeId: string,
		leaseDuration: number,
	): Promise<StartActorAndAcquireLeaseOutput>;
	extendLease(
		actorId: string,
		selfNodeId: string,
		leaseDuration: number,
	): Promise<ExtendLeaseOutput>;
	attemptAcquireLease(
		actorId: string,
		selfNodeId: string,
		leaseDuration: number,
	): Promise<AttemptAcquireLease>;
	releaseLease(actorId: string, nodeId: string): Promise<void>;
}
