import { render } from "ink";
import { Intro } from "./ui/Intro";
import { Task, WorkflowDetails } from "./ui/Workflow";

interface WorkflowResult {
	success: boolean;
	error?: unknown;
}

interface TaskMetadata {
	name: string;
	parent: string | null;
}

const RUNNER_ACTIONS = {
	progress: (
		meta: TaskMetadata,
		status: "running" | "done" | "error",
		res: { error?: unknown; result?: unknown } = {},
	) => ({
		status,
		meta,
		...res,
		__taskProgress: true,
	}),
	hook: (hook: "afterAll", fn: () => void) => ({
		__taskHook: true,
		hook,
		fn,
	}),
};

export type WorkflowProgressAction = ReturnType<
	(typeof RUNNER_ACTIONS)["progress"]
>;

export type WorkflowAction = ReturnType<
	(typeof RUNNER_ACTIONS)[keyof typeof RUNNER_ACTIONS]
>;

type GenericReturnValue =
	// biome-ignore lint/suspicious/noExplicitAny: we don't know the return type of the user function
	| any
	| string
	| number
	// biome-ignore lint/suspicious/noConfusingVoidType: we don't know the return type of the user function
	| void;

type UserFnReturnType =
	| Exclude<
			GenericReturnValue,
			// biome-ignore lint/suspicious/noExplicitAny: excluding, as we want to keep the return type as generic as possible, but still validate it
			any
	  >
	| Promise<GenericReturnValue>
	| AsyncGenerator<
			WorkflowAction | GenericReturnValue | Promise<GenericReturnValue>
	  >
	| Generator<
			WorkflowAction | GenericReturnValue | Promise<GenericReturnValue>
	  >;

interface Context {
	wait: (ms: number) => Promise<undefined>;
	task: <T extends UserFnReturnType>(
		name: string,
		taskFn: (toolbox: Context) => T,
	) => AsyncGenerator<WorkflowAction, T>;
	error: (error: string, opts: WorkflowErrorOpts) => WorkflowError;
	render: (children: React.ReactNode) => void;
	suspend: () => void;
}

export function workflow(
	title: string,
	workflowFn: (toolbox: Context) => AsyncGenerator<WorkflowAction | undefined>,
) {
	let suspended = false;
	let renderUtils: ReturnType<typeof render> | null = null;

	async function* runner<T extends UserFnReturnType>(
		meta: TaskMetadata,
		name: string,
		taskFn: (ctx: Context) => T,
	): AsyncGenerator<WorkflowAction, T> {
		const p = RUNNER_ACTIONS.progress.bind(null, { ...meta, name });
		yield p("running");
		try {
			const output = taskFn(createContext({ ...meta, name }));
			if (output instanceof Promise) {
				const result = await output;
				yield p("done", { result });
				return result;
			}
			const result = yield* output;
			yield p("done", { result });
			return result;
		} catch (error) {
			yield p("error", { error });
			throw error;
		}
	}

	function createContext(meta: TaskMetadata): Context {
		return {
			wait: (ms: number) =>
				new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
			task: runner.bind(null, {
				...meta,
				parent: meta.name,
				name: "",
			}) as Context["task"],
			error(error, opts) {
				return new WorkflowError(error, opts);
			},
			render(children: React.ReactNode) {
				if (!suspended) {
					renderUtils?.rerender(children);
				}

				return RUNNER_ACTIONS.hook("afterAll", () => {
					const { unmount } = render(children);
					unmount();
				});
			},
			suspend() {
				suspended = true;
				renderUtils?.unmount();
			},
		};
	}

	async function* workflowRunner(): AsyncGenerator<
		WorkflowAction,
		WorkflowResult
	> {
		// task <> parent
		const parentMap = new Map<string, string>();
		try {
			yield RUNNER_ACTIONS.progress({ name: title, parent: null }, "running");
			for await (const task of workflowFn(
				createContext({ name: title, parent: null }),
			)) {
				if (!task) {
					continue;
				}

				if ("__taskProgress" in task) {
					const parent = task.meta?.parent || title;
					parentMap.set(task.meta.name, parent);
					// Propagate errors up the tree
					if (task.status === "error") {
						let parentTask = parentMap.get(task.meta.name);
						while (parentTask) {
							const grandParent = parentMap.get(parentTask);
							yield RUNNER_ACTIONS.progress(
								{ name: parentTask, parent: grandParent || null },
								"error",
								{ error: task.error },
							);
							parentTask = grandParent;
						}
					}
					yield task;
				}

				if ("__taskHook" in task) {
					yield task;
				}
			}

			yield RUNNER_ACTIONS.progress({ name: title, parent: null }, "done");
			return { success: true };
		} catch (error) {
			return { success: false, error };
		}
	}

	return {
		title,
		async render() {
			renderUtils = render(
				<>
					<Intro />
					<WorkflowDetails tasks={[]} interactive />
				</>,
				{ patchConsole: false },
			);

			const hooks = { afterAll: [] as (() => void)[] };
			const tasks: WorkflowProgressAction[] = [];
			for await (const task of workflowRunner()) {
				if ("__taskHook" in task) {
					hooks[task.hook].push(task.fn);
					continue;
				}

				const index = tasks.findIndex((t) => t.meta.name === task.meta.name);
				if (index === -1) {
					tasks.push(task);
				} else {
					tasks[index] = { ...tasks[index], ...task };
				}

				if (suspended && task.status === "running") {
					const { unmount } = render(
						<Task
							task={index === -1 ? tasks[tasks.length - 1] : tasks[index]}
							parent={null}
						/>,
					);
					unmount();
					continue;
				}

				if (!suspended) {
					renderUtils.rerender(
						<>
							<Intro />
							<WorkflowDetails tasks={tasks} interactive />
						</>,
					);
				}
			}

			if (suspended) {
				const failedTask = tasks.find((task) => task.status === "error");
				if (failedTask) {
					const { unmount } = render(<Task task={failedTask} parent={null} />);
					unmount();
				}
			}

			for (const hook of hooks.afterAll) {
				hook();
			}
		},
	};
}

interface WorkflowErrorOpts {
	hint?: string;
}

export class WorkflowError extends Error {
	constructor(
		public description: string,
		public opts: WorkflowErrorOpts,
	) {
		super("Workflow failed");
	}
}
