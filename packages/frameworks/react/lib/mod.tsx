import { useStore } from "@tanstack/react-store";
import {
	AnyWorkerCoreApp,
	CreateRivetKitOptions,
	WorkerOptions,
	createRivetKit as createVanillaRivetKit,
} from "@rivetkit/framework-base";
import type { Client, ExtractWorkersFromApp } from "rivetkit/client";
import { useEffect } from "react";

export { createClient } from "rivetkit/client";

export function createRivetKit<App extends AnyWorkerCoreApp>(
	client: Client<App>,
	opts: CreateRivetKitOptions<App> = {},
) {
	const { getOrCreateWorker, store } = createVanillaRivetKit<App>(client, opts);

	function useWorker<WorkerName extends ExtractWorkersFromApp<App>>(
		opts: WorkerOptions<App, WorkerName> & {
			select?: (state: any) => any;
		},
	) {
		const { mount, setState, state } = getOrCreateWorker(opts);

		useEffect(() => {
			setState((prev) => {
				const { select: _, ...params } = opts;
				prev.opts = {
					...params,
					enabled: opts.enabled ?? true,
				};
				return prev;
			});
		}, [opts, setState]);

		useEffect(() => {
			return mount();
		}, [mount]);

		return useStore(state, opts.select);
	}

	return {
		useWorker,
	};
}
