import { join } from "node:path";
import $ from "@david/dax";
import { error, info } from "./logging.ts";

export type DownloadConfig = {
  s3CertsUri: string;
  outDir: string;
  interval?: Temporal.Duration;
  names: string[];
};

async function runDownloadOnce(config: DownloadConfig): Promise<Error | undefined> {
  let err = undefined;
  for (const name of config.names) {
    const src = `${config.s3CertsUri.replace(/\/$/, "")}/${name}`;
    const dest = join(config.outDir, name);
    info(`downloading cert for ${name} from ${src} to ${dest}...`);
    const result = await $`aws s3 sync --exact-timestamps ${src} ${dest}`.noThrow();
    if (result.code !== 0) {
      error(`failed to download cert for ${name}`);
      err = new Error(`failed to download cert for ${name}`);
    }
  }
  return err;
}

function sleep(t: Temporal.Duration): Promise<void> {
  info(`sleeping for ${t.toString()}...`);
  return new Promise((resolve) => setTimeout(resolve, t.total("milliseconds")));
}

export async function runDownload(config: DownloadConfig): Promise<Error | undefined> {
  while (true) {
    const err = runDownloadOnce(config);
    if (!config.interval) {
      return err;
    }
    await sleep(config.interval);
  }
}
