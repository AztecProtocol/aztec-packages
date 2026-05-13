#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Expand ${VAR} and ${VAR:-default} placeholders in string values.
 *
 * Reads JSON on stdin, writes JSON on stdout. Used by load_network_config.sh
 * to substitute current shell environment into merged YAML values.
 */

const PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

function expand(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(
      PATTERN,
      (_, name, fallback) => process.env[name] ?? fallback ?? "",
    );
  }
  if (Array.isArray(value)) {
    return value.map(expand);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expand(v)]),
    );
  }
  return value;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => (input += chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(input);
  process.stdout.write(JSON.stringify(expand(data), null, 2));
});
