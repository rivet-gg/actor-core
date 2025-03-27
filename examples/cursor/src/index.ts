import { setup } from "actor-core";
import { cursorRoom } from "./cursor-room";

export const app = setup({
  actors: {
    cursorRoom,
  },
  cors: {
    origin: ["http://localhost:3000"],
  },
});

export type App = typeof app; 