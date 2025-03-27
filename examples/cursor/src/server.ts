import { setup } from "actor-core";
import { serve } from "@actor-core/nodejs";
import { cursorRoom } from "./cursor-room";

const app = setup({
  actors: {
    cursorRoom,
  },
  cors: {
    origin: ["http://localhost:3000"],
  },
});

serve(app); 