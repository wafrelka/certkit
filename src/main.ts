import { runDownload, runRenew } from "./core/mod.ts";
import { parse } from "./cli.ts";

async function main() {
  const action = parse();

  if ("usage" in action) {
    if (action.error) {
      console.error(action.error.message);
      console.error(action.usage);
    } else {
      console.log(action.usage);
    }
    Deno.exit(action.error ? 1 : 0);
  }

  if (action.command === "download") {
    await runDownload(action.config);
  } else if (action.command === "renew") {
    await runRenew(action.config);
  } else {
    action satisfies never;
  }
}

if (import.meta.main) {
  await main();
}
