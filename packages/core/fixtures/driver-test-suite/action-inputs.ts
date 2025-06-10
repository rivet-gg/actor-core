import { worker, setup } from "rivetkit";

interface State {
	initialInput?: unknown;
	onCreateInput?: unknown;
}

// Test worker that can capture input during creation
const inputWorker = worker({
	createState: (c, { input }): State => {
		return {
			initialInput: input,
			onCreateInput: undefined,
		};
	},

	onCreate: (c, { input }) => {
		c.state.onCreateInput = input;
	},

	actions: {
		getInputs: (c) => {
			return {
				initialInput: c.state.initialInput,
				onCreateInput: c.state.onCreateInput,
			};
		},
	},
});

export const app = setup({
	workers: { inputWorker },
});

export type App = typeof app;
