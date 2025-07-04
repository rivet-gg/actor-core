import { actor, setup } from "@rivetkit/actor";

const counter = actor({
	state: { count: 0 },
	actions: {
		increment: (c, x: number) => {
			c.state.count += x;
			c.broadcast("newCount", c.state.count);
			return c.state.count;
		},
		getCount: (c) => {
			return c.state.count;
		},
		reset: (c) => {
			c.state.count = 0;
			c.broadcast("newCount", c.state.count);
			return c.state.count;
		},
	},
});

export const registry = setup({
	use: { counter },
});