import { WorkflowError, type WorkflowProgressAction } from "../workflow";
import { Box, Text, type TextProps } from "ink";
import Spinner from "ink-spinner";

export const WorkflowDetails = ({
	tasks,
	interactive,
}: { tasks: WorkflowProgressAction[]; interactive?: boolean }) => {
	return (
		<Box flexDirection="column">
			<Tasks tasks={tasks} parent={null} interactive={interactive} />
		</Box>
	);
};

function Tasks({
	tasks,
	parent,
	interactive,
}: {
	tasks: WorkflowProgressAction[];
	parent: string | null;
	interactive?: boolean;
}) {
	const currentTasks = tasks.filter((task) => task.meta.parent === parent);
	if (currentTasks.length === 0) {
		return null;
	}
	return (
		<Box flexDirection="column">
			{currentTasks.map((task) => (
				<Box key={task.meta.name} flexDirection="column">
					<Task task={task} parent={parent} interactive={interactive} />
					{task.status === "done" ? null : (
						<Tasks
							tasks={tasks}
							parent={task.meta.name}
							interactive={interactive}
						/>
					)}
				</Box>
			))}
		</Box>
	);
}

export function Task({
	task,
	parent,
	interactive,
}: {
	task: WorkflowProgressAction;
	parent: string | null;
	interactive?: boolean;
}) {
	return (
		<>
			<Status value={task.status} interactive={interactive}>
				{task.meta.name}
			</Status>
			{task.status === "error" ? (
				<Box marginLeft={2}>
					{task.error instanceof WorkflowError ? (
						<Box flexDirection="column">
							<Text dimColor>{task.error.description}</Text>
							{task.error.opts.hint ? (
								<Text dimColor italic>
									<Text underline>Hint</Text> {task.error.opts.hint || ""}
								</Text>
							) : null}
						</Box>
					) : (
						<Text dimColor>{task.error?.toString()}</Text>
					)}
				</Box>
			) : null}
		</>
	);
}

export function Status({
	value,
	children,
	interactive,
	...rest
}: TextProps & {
	value: WorkflowProgressAction["status"];
	interactive?: boolean;
}) {
	return (
		<Text {...rest}>
			<Text color={"#ff4f00"}>
				{value === "done" ? "✔" : null}
				{value === "error" ? <Text color="red">✖</Text> : null}
				{value === "running" ? (
					interactive ? (
						<Spinner />
					) : (
						<Text>⠋</Text>
					)
				) : null}
			</Text>{" "}
			{children}
			{value === "running" && !interactive ? <Text>…</Text> : null}
		</Text>
	);
}
