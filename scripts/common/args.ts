export type ArgsMap = Record<string, string | boolean>;

export function parseArgs(argv: string[]): ArgsMap {
  const out: ArgsMap = {};
  let posIndex = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      out[`__pos${posIndex}`] = token;
      posIndex += 1;
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }

    out[key] = next;
    i += 1;
  }

  return out;
}

export function getArgString(
  args: ArgsMap,
  key: string,
  fallback?: string
): string | undefined {
  const value = args[key];
  if (typeof value === "string") {
    return value;
  }
  if (key === "cluster" && typeof args.__pos0 === "string") {
    return args.__pos0;
  }
  return fallback;
}
