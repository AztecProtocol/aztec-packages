#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Apply derived computations after merging network config.
 *
 * Replicates bash logic that previously lived inside .env files (e.g. devnet.env's
 * MNEMONIC_INDEX_OFFSET computed from NAMESPACE regex).
 *
 * Reads JSON on stdin, writes JSON on stdout.
 */

interface ConfigData {
  env: Record<string, string>;
  deploy: Record<string, string>;
  [key: string]: unknown;
}

function main(data: ConfigData) {
  const env = (data.env ??= {});
  const deploy = (data.deploy ??= {});

  // devnet: namespace pattern v<MAJOR>-devnet-<ITERATION> picks a non-conflicting
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

  // Mnemonic start indices: shift declared base by MNEMONIC_INDEX_OFFSET. These
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
    const base = parseInt(deploy[key] ?? String(defaultBase), 10);
    deploy[key] = String(base + offset);
  }

  shift("VALIDATOR_MNEMONIC_START_INDEX", 1);
  shift("VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX", 5000);
  shift("PROVER_PUBLISHER_MNEMONIC_START_INDEX", 8000);

  return data;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => (input += chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(input) as ConfigData;
  process.stdout.write(JSON.stringify(main(data), null, 2));
});
