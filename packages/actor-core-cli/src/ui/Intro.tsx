import { Box } from "ink";
import BigText from "ink-big-text";
import React from "react";

export function Intro() {
	return (
		<Box flexDirection="column">
			<BigText
				text="Actor Core"
				font="tiny"
				colors={["#ff4f00"]}
				lineHeight={0}
				space={false}
			/>
		</Box>
	);
}
