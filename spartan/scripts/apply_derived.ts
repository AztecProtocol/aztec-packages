#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Apply env overrides and derived computations after merging network config.
 *
 * Pipeline:
 *   1. Env spread: shell env wins for any key already present in deploy:/env: blocks.
 *   2. Mnemonic index offset: computed from NAMESPACE devnet pattern.
 *   3. Mnemonic start indices: shifted by offset.
 *   4. Derived rules: evaluates the optional `derived:` block from the network YAML,
 *      expanding ${VAR} templates using resolved deploy/env values as context.
 *      Only fills in keys that are currently empty/unset. Stripped from output.
 *
 * Reads JSON on stdin, writes JSON on stdout.
 */

interface ConfigData {
  env: Record<string, string>;
  deploy: Record<string, unknown>;
  derived?: {
    deploy?: Record<string, unknown>;
    env?: Record<string, string>;
  };
  [key: string]: unknown;
}

function applyEnvSpread(data: ConfigData) {
  for (const blockKey of ["deploy", "env"] as const) {
    const block = data[blockKey];
    if (!block) continue;
    for (const key of Object.keys(block)) {
      const envVal = process.env[key];
      if (envVal !== undefined) {
        block[key] = envVal;
      }
    }
  }
}

function isEmpty(v: unknown): boolean {
  return !v || (Array.isArray(v) && v.length === 0);
}

function expandTemplate(
  template: unknown,
  ctx: Record<string, string>,
): unknown {
  if (typeof template === "string") {
    return template.replace(/\$\{([^}]+)\}/g, (_, name) => ctx[name] ?? "");
  }
  if (Array.isArray(template)) {
    return template.map((item) => expandTemplate(item, ctx));
  }
  return template;
}

function applyDerivedRules(data: ConfigData) {
  const rules = data.derived;
  if (!rules) return;

  // Context: all resolved scalar values from deploy and env.
  const ctx: Record<string, string> = {};
  for (const [k, v] of Object.entries(data.deploy ?? {})) {
    if (typeof v === "string") ctx[k] = v;
  }
  for (const [k, v] of Object.entries(data.env ?? {})) {
    if (typeof v === "string") ctx[k] = v;
  }

  for (const blockKey of ["deploy", "env"] as const) {
    const blockRules = rules[blockKey];
    if (!blockRules) continue;
    const block = data[blockKey] ?? {};
    for (const [key, template] of Object.entries(blockRules)) {
      if (isEmpty(block[key])) {
        (block as Record<string, unknown>)[key] = expandTemplate(template, ctx);
      }
    }
  }

  // Strip derived: from output — it's a processing directive, not a runtime value.
  delete data.derived;
}

function main(data: ConfigData) {
  const env = (data.env ??= {});
  const deploy = (data.deploy ??= {});

  // Step 1: shell env wins for any key already present in deploy: or env:
  applyEnvSpread(data);

  // Step 2: devnet namespace pattern v<MAJOR>-devnet-<ITERATION> picks a non-conflicting
  // mnemonic offset so concurrent devnets sharing the same mnemonic on the same L1
  // do not collide on nonces.
  const namespace = String(deploy.NAMESPACE ?? env.NAMESPACE ?? "");
  const m = namespace.match(/^v(\d+)-devnet-(\d+)$/);
  let offset: number;
  if (m) {
    const major = parseInt(m[1], 10);
    const iteration = parseInt(m[2], 10);
    offset = major * 100000 + (iteration - 1) * 10000;
  } else if ("MNEMONIC_INDEX_OFFSET" in env) {
    offset = parseInt(env.MNEMONIC_INDEX_OFFSET, 10);
  } else {
    offset = 0;
  }
  env.MNEMONIC_INDEX_OFFSET = String(offset);

  // Step 3: Mnemonic start indices — shift declared base by MNEMONIC_INDEX_OFFSET. These
  // live under deploy: because they configure the deploy script (terraform.tfvars
  // generation), not pod env.
  function shift(key: string, defaultBase: number) {
    if (key in env) {
      process.stderr.write(
        `load_network_config: ${key} found under env: -- it must live under deploy:\n` +
          `  Move it to the deploy: block so MNEMONIC_INDEX_OFFSET is applied.\n`,
      );
      process.exit(1);
    }
    const base = parseInt(String(deploy[key] ?? defaultBase), 10);
    deploy[key] = String(base + offset);
  }

  shift("VALIDATOR_MNEMONIC_START_INDEX", 1);
  shift("VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX", 5000);
  shift("PROVER_PUBLISHER_MNEMONIC_START_INDEX", 8000);

  // Step 4: evaluate derived: rules from the network YAML.
  applyDerivedRules(data);

  return data;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => (input += chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(input) as ConfigData;
  process.stdout.write(JSON.stringify(main(data), null, 2));
});
