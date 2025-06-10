import type { WorkerCoreApp } from "rivetkit";
import { DriverConfigSchema } from "rivetkit/driver-helpers";
import { z } from "zod";

export const ConfigSchema = DriverConfigSchema.extend({
	app: z.custom<WorkerCoreApp<any>>(),
});
export type InputConfig = z.input<typeof ConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
