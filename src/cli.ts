import process from "node:process";
import { parseArgs } from "node:util";
import { DownloadConfig, RenewConfig } from "./core/mod.ts";
import { z } from "@zod/zod";

const FileConfig = z.object({
  download: z.object({
    s3_certs_uri: z.string().optional(),
    out_dir: z.string().optional(),
    interval: z.string().optional(),
    names: z.array(z.string()).optional(),
  }).optional(),
  renew: z.object({
    s3_certs_uri: z.string().optional(),
    s3_states_uri: z.string().optional(),
    email: z.string().optional(),
    lego_dir: z.string().optional(),
    interval: z.string().optional(),
    subjects: z.array(z.array(z.string())).optional(),
  }).optional(),
});

export type FileConfig = z.infer<typeof FileConfig>;

export type Actions = DownloadAction | RenewAction;

export type DownloadAction = {
  command: "download";
  config: DownloadConfig;
};

export type RenewAction = {
  command: "renew";
  config: RenewConfig;
};

const help = { type: "boolean", short: "h" } as const;
const globalOptions = { help } as const;
const globalUsage = `Usage:
  certkit <command> [options] ...

Commands:
  download    Download certificates from S3
  renew       Renew certificates and upload to S3
`;

const downloadOptions = {
  help,
  config: { type: "string", short: "c" },
  "s3-certs-uri": { type: "string" },
  "out-dir": { type: "string" },
  interval: { type: "string" },
} as const;
const downloadUsage = `Usage:
  certkit download [options] <name>...

Options:
  --help, -h               Show this help message and exit
  --config, -c string      Path to config file
  --s3-certs-uri string    S3 base URI to download certificates from, e.g. s3://my-bucket/certs/
  --out-dir string         Directory to store downloaded certificates (default: ./certs)
  --interval string        Run download every interval instead of just once (e.g. "PT24H" for every day)
  name                     Certificate name to download, e.g. "example.com"
`;

const renewOptions = {
  help,
  config: { type: "string", short: "c" },
  "s3-certs-uri": { type: "string" },
  "s3-states-uri": { type: "string" },
  email: { type: "string" },
  "lego-dir": { type: "string" },
  interval: { type: "string" },
} as const;
const renewUsage = `Usage:
  certkit renew [options] <subject>...

Options:
  --help, -h                Show this help message and exit
  --config, -c string       Path to config file
  --s3-certs-uri string     S3 base URI to store certificates, e.g. s3://my-bucket/certs/
  --s3-states-uri string    S3 base URI to store states, e.g. s3://my-bucket/states/
  --email string            Email address for ACME registration and recovery contact
  --lego-dir string         Directory to store lego state files
  --interval string         Run renewal every interval instead of just once (e.g. "PT24H" for every day)
  subject                   Certificate name to renew, with optional comma-separated SANs, e.g. "example.com,www.example.com"
`;

type UsageAction = {
  usage: string;
  error?: Error;
};

function parseFileConfig(path: string): FileConfig {
  const text = Deno.readTextFileSync(path);
  let json: string;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse config file: ${path}, ${e}`);
  }
  const result = FileConfig.safeParse(json);
  if (!result.success) {
    const err = z.prettifyError(result.error);
    throw new Error(`Failed to parse config file: ${path}, ${err}`);
  }
  return result.data;
}

function parseDownloadAction(args: string[]): DownloadAction | UsageAction {
  const { values, positionals } = parseArgs({
    options: downloadOptions,
    args,
    allowPositionals: true,
  });
  if (values["help"]) {
    return { usage: downloadUsage };
  }

  const fileConfigPath = values["config"] || Deno.env.get("CONFIG_FILE");
  const fileConfig = fileConfigPath ? parseFileConfig(fileConfigPath).download : undefined;

  const s3CertsUri = values["s3-certs-uri"] || fileConfig?.s3_certs_uri;
  if (!s3CertsUri) {
    throw new Error("Missing required option: --s3-certs-uri");
  }
  const outDir = values["out-dir"] || fileConfig?.out_dir || "./certs";
  const intervalStr = values["interval"] || fileConfig?.interval;
  const interval = intervalStr ? Temporal.Duration.from(intervalStr) : undefined;
  const names = positionals.length > 0 ? positionals : (fileConfig?.names || []);
  const config = { s3CertsUri, outDir, interval, names };

  return { command: "download", config };
}

function parseRenewAction(args: string[]): RenewAction | UsageAction {
  const { values, positionals } = parseArgs({
    options: renewOptions,
    args,
    allowPositionals: true,
  });
  if (values["help"]) {
    return { usage: renewUsage };
  }

  const fileConfigPath = values["config"] || Deno.env.get("CONFIG_FILE");
  const fileConfig = fileConfigPath ? parseFileConfig(fileConfigPath).renew : undefined;

  const s3CertsUri = values["s3-certs-uri"] || fileConfig?.s3_certs_uri;
  if (!s3CertsUri) {
    throw new Error("Missing required option: --s3-certs-uri");
  }
  const s3StatesUri = values["s3-states-uri"] || fileConfig?.s3_states_uri;
  if (!s3StatesUri) {
    throw new Error("Missing required option: --s3-states-uri");
  }
  const email = values["email"] || fileConfig?.email;
  if (!email) {
    throw new Error("Missing required option: --email");
  }
  const legoDir = values["lego-dir"] || fileConfig?.lego_dir;
  const intervalStr = values["interval"] || fileConfig?.interval;
  const interval = intervalStr ? Temporal.Duration.from(intervalStr) : undefined;
  const posSubjects =
    positionals.map((s) => s.split(",").map((t) => t.trim()).filter((t) => t.length > 0));
  const subjects = posSubjects.length > 0 ? posSubjects : (fileConfig?.subjects || []);
  const config = { s3CertsUri, s3StatesUri, email, legoDir, interval, subjects };

  return { command: "renew", config };
}

export function parse(args: string[] = []): Actions | UsageAction {
  if (args.length === 0) {
    args = process.argv.slice(2);
  }

  const { tokens } = parseArgs({
    options: globalOptions,
    args,
    strict: false,
    tokens: true,
  });
  const commandIndex = tokens.find((e) => e.kind === "positional")?.index ?? args.length;
  const command = args[commandIndex];
  const head = args.slice(0, commandIndex);
  const tail = args.slice(commandIndex + 1);

  const { values } = parseArgs({ options: globalOptions, args: head });

  if (command === "download") {
    try {
      return parseDownloadAction(tail);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return { usage: downloadUsage, error: err };
    }
  }
  if (command === "renew") {
    try {
      return parseRenewAction(tail);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return { usage: renewUsage, error: err };
    }
  }

  if (values.help) {
    return { usage: globalUsage };
  }

  if (command) {
    return { usage: globalUsage, error: new Error(`Unknown command: ${command}`) };
  } else {
    return { usage: globalUsage, error: new Error("Missing command") };
  }
}
