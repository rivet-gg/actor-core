import { createRouter } from "@actor-core/redis";
import { upgradeWebSocket } from "hono/deno";
import type { Config } from "./config";

export function serve(config: Config) {
  const app = createRouter(config, {
    getUpgradeWebSocket: app => {
      return upgradeWebSocket;
    },
  });

  Deno.serve({
    hostname: config.server?.hostname ?? "localhost",
    port: config.server?.port ?? 8787,
  }, app.fetch);
}
