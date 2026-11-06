type Level = "INFO" | "WARN" | "ERROR";

function write(level: Level, scope: string, msg: string, data?: unknown) {
  const line = `${new Date().toISOString()} [${level}] [${scope}] ${msg}`;
  const fn = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
  if (data === undefined) {
    fn(line);
    return;
  }
  let extra: string;
  if (data instanceof Error) {
    extra = data.stack ?? data.message;
  } else {
    try {
      extra = JSON.stringify(data);
    } catch {
      extra = String(data);
    }
  }
  fn(`${line} ${extra}`);
}

export const logger = {
  info: (scope: string, msg: string, data?: unknown) => write("INFO", scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => write("WARN", scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => write("ERROR", scope, msg, data),
};
