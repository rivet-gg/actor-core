import { z } from "zod";
import { WorkerQuerySchema } from "./query";
import { TransportSchema } from "@/worker/protocol/message/mod";
export * from "./query";

export const WorkersRequestSchema = z.object({
	query: WorkerQuerySchema,
});

export const WorkersResponseSchema = z.object({
	workerId: z.string(),
	supportedTransports: z.array(TransportSchema),
});

//export const RivetConfigResponseSchema = z.object({
//	endpoint: z.string(),
//	project: z.string().optional(),
//	environment: z.string().optional(),
//});

export type WorkersRequest = z.infer<typeof WorkersRequestSchema>;
export type WorkersResponse = z.infer<typeof WorkersResponseSchema>;
//export type RivetConfigResponse = z.infer<typeof RivetConfigResponseSchema>;

