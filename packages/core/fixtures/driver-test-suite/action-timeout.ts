import { worker, setup } from "rivetkit";

// Short timeout worker
const shortTimeoutWorker = worker({
	state: { value: 0 },
	options: {
		action: {
			timeout: 50, // 50ms timeout
		},
	},
	actions: {
		quickAction: async (c) => {
			return "quick response";
		},
		slowAction: async (c) => {
			// This action should timeout
			await new Promise((resolve) => setTimeout(resolve, 100));
			return "slow response";
		},
	},
});

// Long timeout worker
const longTimeoutWorker = worker({
	state: { value: 0 },
	options: {
		action: {
			timeout: 200, // 200ms timeout
		},
	},
	actions: {
		delayedAction: async (c) => {
			// This action should complete within timeout
			await new Promise((resolve) => setTimeout(resolve, 100));
			return "delayed response";
		},
	},
});

// Default timeout worker
const defaultTimeoutWorker = worker({
	state: { value: 0 },
	actions: {
		normalAction: async (c) => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			return "normal response";
		},
	},
});

// Sync worker (timeout shouldn't apply)
const syncWorker = worker({
	state: { value: 0 },
	options: {
		action: {
			timeout: 50, // 50ms timeout
		},
	},
	actions: {
		syncAction: (c) => {
			return "sync response";
		},
	},
});

export const app = setup({
	workers: {
		shortTimeoutWorker,
		longTimeoutWorker,
		defaultTimeoutWorker,
		syncWorker,
	},
});

export type App = typeof app;

