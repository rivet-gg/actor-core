import { setup } from "actor-core";
import chatRoom from "./chat-room";

export const app = setup({
    actors: {
        chatRoom
    },
});

export type App = typeof app;