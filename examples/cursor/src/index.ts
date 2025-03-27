import { createClient } from "actor-core/client";
import { createReactActorCore } from "@actor-core/react";
import type { cursorRoom } from "./cursor-room";

export interface App {
  actors: {
    cursorRoom: typeof cursorRoom;
  };
}

const client = createClient<App>("http://localhost:6420");
export const actorCore = createReactActorCore(client); 