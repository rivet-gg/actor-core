#!/usr/bin/env -S deno run -A

const endpoint = Deno.env.get("RIVET_BACKEND_ENDPOINT");

const res = await fetch(`${endpoint}/modules/lobbies/scripts/reset_lobby_manager_state/call`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({}),
});
if (res.status != 200) {
  console.error(await res.text());
  Deno.exit(1);
}

console.log(await res.json());

