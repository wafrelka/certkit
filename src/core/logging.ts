export function info(...args: unknown[]) {
  const now = new Date().toISOString();
  console.log(`[INFO] [${now}]`, ...args);
}

export function error(...args: unknown[]) {
  const now = new Date().toISOString();
  console.error(`[ERROR] [${now}]`, ...args);
}
