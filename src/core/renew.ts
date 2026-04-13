import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import $ from "@david/dax";
import { error, info } from "./logging.ts";
import { joinUrl } from "./path.ts";

export type RenewConfig = {
  s3CertsUri: string;
  s3StatesUri: string;
  email: string;
  legoDir?: string;
  interval?: Temporal.Duration;
  subjects: string[][];
};

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "certkit-"));
  info(`created temporary directory ${tempDir}`);
  return tempDir;
}

async function runRenewOnce(config: RenewConfig): Promise<Error | undefined> {
  const legoDir = (config.legoDir ?? await makeTempDir()).replace(/\/+$/, "");
  let err = undefined;

  const stateUri = joinUrl(config.s3StatesUri, "lego");

  const result = await $`aws s3 sync --delete ${stateUri} ${legoDir}`.noThrow();
  if (result.code !== 0) {
    error(`failed to sync state from ${stateUri}`);
    return new Error(`failed to sync state from ${stateUri}`);
  }

  for (const subject of config.subjects) {
    const main = subject[0];
    const name = main.replace(/\*/g, "_");

    const crtPath = join(legoDir, "certificates", `${name}.crt`);
    const keyPath = join(legoDir, "certificates", `${name}.key`);
    const crtExists = await stat(crtPath).then(() => true).catch(() => false);

    const legoCmd = [
      "lego",
      "--accept-tos",
      `--path=${legoDir}`,
      `--email=${config.email}`,
      `--dns=route53`,
      ...subject.map((d) => `--domains=${d}`),
      crtExists ? "renew" : "run",
    ];

    if (crtExists) {
      info(`renewing cert for ${main}...`);
    } else {
      info(`requesting new cert for ${main}...`);
    }

    // https://docs.aws.amazon.com/general/latest/gr/r53.html
    // > Route 53 in AWS Regions other than the Beijing and Ningxia Regions:
    // >     specify us-east-1 as the Region.
    const region = "us-east-1";

    const result = await $`${legoCmd}`.env({ AWS_REGION: region }).noThrow();
    if (result.code !== 0) {
      error(`failed to renew cert for ${main}`);
      err = new Error(`failed to renew cert for ${main}`);
      continue;
    }

    const keyUri = joinUrl(config.s3CertsUri, name, "privkey.pem");
    const crtUri = joinUrl(config.s3CertsUri, name, "fullchain.pem");

    try {
      await $`aws s3 sync --delete ${legoDir} ${stateUri}`;
      await $`aws s3 cp ${keyPath} ${keyUri}`;
      await $`aws s3 cp ${crtPath} ${crtUri}`;
    } catch (e) {
      const m = `failed to sync state to ${stateUri}: ${
        e instanceof Error ? e.message : String(e)
      }`;
      error(m);
      err = new Error(m);
      continue;
    }

    info(`successfully renewed cert for ${main}`);
  }

  return err;
}

function sleep(t: Temporal.Duration): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, t.total("milliseconds")));
}

export async function runRenew(config: RenewConfig): Promise<Error | undefined> {
  if (!config.legoDir) {
    config.legoDir = await makeTempDir();
  }

  while (true) {
    const err = await runRenewOnce(config);
    if (!config.interval) {
      return err;
    }
    await sleep(config.interval);
  }
}
