import { $ } from "execa";
import { render } from "ink";
import { Intro } from "./ui/Intro";
import { WorkflowDetails } from "./ui/Workflow";
import { withResolvers } from "./utils/mod";

interface WorkflowResult {
	success: boolean;
	error?: unknown;
}

interface TaskMetadata {
	name: string;
	parent: string | null;
}

export type Option = {
	label: string;
	value: string;
};

export namespace WorkflowAction {
	export interface Progress {
		status: "running" | "done" | "error";
		meta: TaskMetadata;
		result?: unknown;
		error?: unknown;
		__taskProgress: true;
	}

	export const progress = (
		meta: TaskMetadata,
		status: "running" | "done" | "error",
		res: { error?: unknown; result?: unknown } = {},
	): Progress => ({
		status,
		meta,
		...res,
		__taskProgress: true,
	});

	export namespace Prompt {
		interface Base {
			meta: TaskMetadata;
			question: string;
			__taskPrompt: true;
		}
		export interface Select extends Base {
			opts: {
				type: "select";
				choices: Option[];
				defaultValue?: string;
				answer: string | null;
				onSubmit: (value: string) => void;
			};
		}

		export interface Confirm extends Base {
			opts: {
				type: "confirm";
				answer: boolean | null;
				onSubmit: (value: boolean) => void;
			};
		}

		export interface Text extends Base {
			opts: {
				type: "text";
				answer: string | null;
				placeholder?: string;
				defaultValue?: string;
				onSubmit: (value: string) => void;
				validate?: (value: string) => string | true;
			};
		}

		export type Any = Select | Confirm | Text;
		export type Type = Any["opts"]["type"];
		export type One<T extends Type> = T extends "select"
			? Select
			: T extends "confirm"
				? Confirm
				: T extends "text"
					? Text
					: undefined;
		export type Answer<T extends Type> = Exclude<
			One<T>["opts"]["answer"],
			null
		>;
	}

	export const prompt = <T extends Prompt.Type>(
		meta: TaskMetadata,
		question: string,
		opts: Prompt.One<T>["opts"],
	): Prompt.One<T> => {
		return {
			meta,
			question,
			opts,
			__taskPrompt: true,
		} as Prompt.One<T>;
	};

	export type Interface = Progress | Prompt.Any;

	export interface Hook {
		__taskHook: true;
		hook: "afterAll";
		fn: (opts: { tasks: Interface[] }) => void;
	}

	export const hook = (
		hook: "afterAll",
		fn: (opts: { tasks: Interface[] }) => void,
	): Hook => ({
		__taskHook: true,
		hook,
		fn,
	});

	export type All = Interface | Hook;
}

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
			| WorkflowAction.Interface
			| GenericReturnValue
			| Promise<GenericReturnValue>
	  >
	| Generator<
			| WorkflowAction.Interface
			| GenericReturnValue
			| Promise<GenericReturnValue>
	  >;

interface Context {
	wait: (ms: number) => Promise<undefined>;
	task: <T extends UserFnReturnType>(
		name: string,
		taskFn: (toolbox: Context) => T,
	) => AsyncGenerator<
		WorkflowAction.All,
		T extends AsyncGenerator<
			// biome-ignore lint/suspicious/noExplicitAny: we don't know the return type of the user function
			any,
			infer G
		>
			? G
			: T
	>;
	error: (error: string, opts: WorkflowErrorOpts) => WorkflowError;
	render: (children: React.ReactNode) => WorkflowAction.All;
	suspend: () => void;
	prompt: <T extends WorkflowAction.Prompt.Type>(
		question: string,
		opts: Omit<WorkflowAction.Prompt.One<T>["opts"], "answer" | "onSubmit"> & {
			type: T;
		},
	) => AsyncGenerator<
		WorkflowAction.Prompt.One<T>,
		WorkflowAction.Prompt.Answer<T>
	>;
	$: (
		...params: readonly [
			TemplateStringsArray,
			// biome-ignore lint/suspicious/noExplicitAny: execa does not expose the return type of the command
			...(readonly any[]),
		]
	) => AsyncGenerator<
		WorkflowAction.All,
		{ stdout: string; exitCode?: number }
	>;
}

export function workflow(
	title: string,
	workflowFn: (
		toolbox: Context,
	) => AsyncGenerator<WorkflowAction.All | undefined>,
) {
	let renderUtils: ReturnType<typeof render> | null = null;

	async function* runner<T extends UserFnReturnType>(
		meta: TaskMetadata,
		name: string,
		taskFn: (ctx: Context) => T,
	): AsyncGenerator<WorkflowAction.All, T> {
		const p = WorkflowAction.progress.bind(null, { ...meta, name });
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
			// bail out
			throw null;
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
				return WorkflowAction.hook("afterAll", ({ tasks }) => {
					const { unmount } = render(
						<>
							<Intro />
							<WorkflowDetails tasks={tasks} interactive />
							{children}
						</>,
					);
					unmount();
				});
			},
			suspend() {
				renderUtils?.unmount();
			},
			prompt: async function* <T extends WorkflowAction.Prompt.Type>(
				question: string,
				opts: Omit<WorkflowAction.Prompt.One<T>["opts"], "answer" | "onSubmit">,
			): AsyncGenerator<
				WorkflowAction.Prompt.One<T>,
				WorkflowAction.Prompt.Answer<T>
			> {
				const { promise, resolve, reject } =
					withResolvers<WorkflowAction.Prompt.Answer<T>>();

				yield WorkflowAction.prompt<T>(
					{ ...meta, parent: meta.name, name: question },
					question,
					{
						answer: null,
						onSubmit: resolve,
						...opts,
					} as WorkflowAction.Prompt.One<T>["opts"],
				);

				const result = await promise;

				yield WorkflowAction.prompt<T>(
					{ ...meta, parent: meta.name, name: question },
					question,
					{
						answer: result,
						onSubmit: resolve,
						...opts,
					} as WorkflowAction.Prompt.One<T>["opts"],
				);

				return result;
			},
			// biome-ignore lint/correctness/useYield: <explanation>
			$: async function* (...opts) {
				// yield WorkflowAction.progress({ ...meta, name: opts }, "running");
				const result = await $(...opts);
				// yield WorkflowAction.progress({ ...meta, name: opts }, "done");
				return { stdout: result.stdout, exitCode: result.exitCode };
			},
		};
	}

	async function* workflowRunner(): AsyncGenerator<
		WorkflowAction.All,
		WorkflowResult
	> {
		// task <> parent
		const parentMap = new Map<string, string>();
		try {
			yield WorkflowAction.progress({ name: title, parent: null }, "running");
			for await (const task of workflowFn(
				createContext({ name: title, parent: null }),
			)) {
				if (!task || typeof task !== "object") {
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
							yield WorkflowAction.progress(
								{ name: parentTask, parent: grandParent || null },
								"error",
							);
							parentTask = grandParent;
						}
					}
					yield task;
				}

				if ("__taskHook" in task || "__taskPrompt" in task) {
					yield task;
				}
			}

			yield WorkflowAction.progress({ name: title, parent: null }, "done");
			return { success: true };
		} catch (error) {
			yield WorkflowAction.progress({ name: title, parent: null }, "error", {
				error,
			});
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
			);

			const hooks = {
				afterAll: [] as ((opts: {
					tasks: WorkflowAction.Interface[];
				}) => void)[],
			};
			const tasks: WorkflowAction.Interface[] = [];
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

				renderUtils.rerender(
					<>
						<Intro />
						<WorkflowDetails tasks={tasks} interactive />
					</>,
				);
			}

			for (const hook of hooks.afterAll) {
				hook({ tasks });
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
