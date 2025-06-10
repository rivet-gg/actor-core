import type { WorkerKey } from "@/common/utils";

export type NodeMessageCallback = (message: string) => void;

export interface GetWorkerLeaderOutput {
	/** Undefined if not initialized. */
	worker?: {
		leaderNodeId?: string;
	};
}

export interface StartWorkerAndAcquireLeaseOutput {
	/** Undefined if not initialized. */
	worker?: {
		name?: string;
		key?: WorkerKey;
		leaderNodeId?: string;
	};
}

export interface ExtendLeaseOutput {
	leaseValid: boolean;
}

export interface AttemptAcquireLease {
	newLeaderNodeId: string;
}

export interface CoordinateDriver {
	// MARK: Node communication
	createNodeSubscriber(
		selfNodeId: string,
		callback: NodeMessageCallback,
	): Promise<void>;
	publishToNode(targetNodeId: string, message: string): Promise<void>;

	// MARK: Worker lifecycle
	getWorkerLeader(workerId: string): Promise<GetWorkerLeaderOutput>;
	startWorkerAndAcquireLease(
		workerId: string,
		selfNodeId: string,
		leaseDuration: number,
	): Promise<StartWorkerAndAcquireLeaseOutput>;
	extendLease(
		workerId: string,
		selfNodeId: string,
		leaseDuration: number,
	): Promise<ExtendLeaseOutput>;
	attemptAcquireLease(
		workerId: string,
		selfNodeId: string,
		leaseDuration: number,
	): Promise<AttemptAcquireLease>;
	releaseLease(workerId: string, nodeId: string): Promise<void>;
}