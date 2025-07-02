//! These configs configs hold anything that's not platform-specific about running actors.

import type { ActorDefinition, AnyActorDefinition } from "@/actor/definition";
import { InspectorConfigSchema } from "@/inspector/config";
import { z } from "zod";

export const ActorsSchema = z.record(
	z.string(),
	z.custom<ActorDefinition<any, any, any, any, any, any, any, any>>(),
);
export type RegistryActors = z.infer<typeof ActorsSchema>;

export const TestConfigSchema = z.object({ enabled: z.boolean() });
export type TestConfig = z.infer<typeof TestConfigSchema>;

/** Base config used for the actor config across all platforms. */
export const RegistryConfigSchema = z.object({
	use: z.record(z.string(), z.custom<AnyActorDefinition>()),

	inspector: InspectorConfigSchema,

	// TODO: Find a better way of passing around the test config
	/**
	 * Test configuration.
	 *
	 * DO NOT MANUALLY ENABLE. THIS IS USED INTERNALLY.
	 * @internal
	 **/
	test: TestConfigSchema.optional().default({ enabled: false }),
});
export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;
export type RegistryConfigInput<A extends RegistryActors> = Omit<
	z.input<typeof RegistryConfigSchema>,
	"use"
> & { use: A };
