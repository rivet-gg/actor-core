import { actor } from "actor-core";

const counter = actor({
	createState: () => ({ count: 0 }),
	actions: {
		increment: (c, x: number) => {
			c.state.count += x;
			c.broadcast("newCount", c.state.count);
			return c.state.count;
		},
	},
});

export default counter;
