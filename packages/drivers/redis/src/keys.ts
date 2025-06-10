export const KEYS = {
	WORKER: {
		// KEY
		initialized: (workerId: string) => `worker:${workerId}:initialized`,
		LEASE: {
			// KEY (expire) = node ID
			node: (workerId: string) => `worker:${workerId}:lease:node`,
		},
		// KEY
		metadata: (workerId: string) => `worker:${workerId}:metadata`,
		// KEY
		persistedData: (workerId: string) => `worker:${workerId}:persisted_data`,
		// KEY
		input: (workerId: string) => `worker:${workerId}:input`,
	},
};

export const PUBSUB = {
	node(nodeId: string) {
		return `node:${nodeId}:messages`;
	},
};
