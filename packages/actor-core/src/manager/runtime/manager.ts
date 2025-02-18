import { ActorsRequestSchema } from "@/manager/protocol/mod";
import { Hono, type Context as HonoContext } from "hono";
import type { GetActorOutput, ManagerDriver } from "@/actor/runtime/driver";
import { logger } from "./log";
import { ActorTags, assertUnreachable } from "@/common/utils";

export class Manager {
	#driver: ManagerDriver;

	router: Hono;

	public constructor(driver: ManagerDriver) {
		this.#driver = driver;

		this.router = this.#buildRouter();
	}

	#buildRouter(): Hono {
		const managerApp = new Hono();

		managerApp.post("/actors", async (c: HonoContext) => {
			const { query } = ActorsRequestSchema.parse(await c.req.json());
			logger().debug("query", { query });

			// Get the actor from the manager
			let actorOutput: GetActorOutput;
			if ("getForId" in query) {
				actorOutput = await this.#driver.getForId(query.getForId.actorId);
			} else if ("getOrCreateForTags" in query) {
				const tags = query.getOrCreateForTags.tags;
				if (!tags) throw new Error("Must define tags in getOrCreateForTags");

				const existingActor = await this.#driver.getWithTags(tags as ActorTags);
				if (existingActor) {
					// Actor exists
					actorOutput = existingActor;
				} else {
					if (query.getOrCreateForTags.create) {
						// Create if needed
						actorOutput = await this.#driver.createActor(
							query.getOrCreateForTags.create,
						);
					}
					// Creation disabled
					throw new Error("Actor not found with tags or is private.");
				}
			} else if ("create" in query) {
				actorOutput = await this.#driver.createActor(query.create);
			} else {
				assertUnreachable(query);
			}

			return c.json({
				endpoint: actorOutput.endpoint,
				supportedTransports: ["websocket", "sse"],
			});
		});

		return new Hono().route("/manager", managerApp);
	}
}

