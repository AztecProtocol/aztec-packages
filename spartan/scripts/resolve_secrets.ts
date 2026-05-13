#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Resolve REPLACE_WITH_GCP_SECRET placeholders by calling gcloud.
 *
 * Reads JSON on stdin, writes JSON on stdout. Mask commands and any diagnostic
 * output go to stderr (must NOT pollute the JSON stdout or downstream jq pipelines
 * fail with "parse error"). Skipped if `gcloud` is not on PATH.
 */

import { execFileSync } from "node:child_process";
import { execSync } from "node:child_process";

const PLACEHOLDER = "REPLACE_WITH_GCP_SECRET";

const JSON_ARRAY_SECRETS = new Set([
  "ETHEREUM_RPC_URLS",
  "ETHEREUM_CONSENSUS_HOST_URLS",
  "ETHEREUM_CONSENSUS_HOST_API_KEYS",
  "ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS",
]);

function secretNameFor(
  envVar: string,
  env: Record<string, string>,
  deploy: Record<string, string>,
): string | undefined {
  const l1Network = env.L1_NETWORK || deploy.L1_NETWORK || "sepolia";
  const network = env.NETWORK || deploy.NETWORK || "";
  const customMnemonic =
    deploy.LABS_INFRA_MNEMONIC_SECRET_NAME ||
    env.LABS_INFRA_MNEMONIC_SECRET_NAME;
  const mnemonicSecret =
    customMnemonic || `${l1Network}-labs-${network}-mnemonic`;

  const mapping: Record<string, string> = {
    ETHEREUM_RPC_URLS: `${l1Network}-rpc-urls`,
    ETHEREUM_CONSENSUS_HOST_URLS: `${l1Network}-consensus-host-urls`,
    ETHEREUM_CONSENSUS_HOST_API_KEYS: `${l1Network}-consensus-host-api-keys`,
    ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS: `${l1Network}-consensus-host-api-key-headers`,
    FUNDING_PRIVATE_KEY: `${l1Network}-funding-private-key`,
    ROLLUP_DEPLOYMENT_PRIVATE_KEY: `${l1Network}-labs-rollup-private-key`,
    OTEL_COLLECTOR_ENDPOINT: "otel-collector-url",
    ETHERSCAN_API_KEY: "etherscan-api-key",
    LABS_INFRA_MNEMONIC: mnemonicSecret,
    STORE_SNAPSHOT_URL: "r2-account-id",
    AWS_ACCESS_KEY_ID: "r2-access-key-id",
    AWS_SECRET_ACCESS_KEY: "r2-secret-access-key",
  };

  return mapping[envVar];
}

function emitMask(value: string) {
  if (!value) return;
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      for (const element of JSON.parse(value)) {
        if (element) process.stderr.write(`::add-mask::${element}\n`);
      }
      return;
    } catch {
      // not valid JSON array, mask the whole thing
    }
  }
  process.stderr.write(`::add-mask::${value}\n`);
}

const secretCache = new Map<string, string | undefined>();

function fetch(secretName: string, projectId: string): string | undefined {
  if (!projectId) {
    process.stderr.write(
      `resolve_secrets: GCP_PROJECT_ID not set; cannot fetch ${secretName}\n`,
    );
    return undefined;
  }
  if (secretCache.has(secretName)) {
    return secretCache.get(secretName);
  }
  try {
    const result = execFileSync(
      "gcloud",
      [
        "secrets",
        "versions",
        "access",
        "latest",
        "--secret",
        secretName,
        "--project",
        projectId,
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    emitMask(result);
    secretCache.set(secretName, result);
    return result;
  } catch (err: any) {
    process.stderr.write(
      `resolve_secrets: failed to read ${secretName}: ${err.stderr ?? err.message}\n`,
    );
    secretCache.set(secretName, undefined);
    return undefined;
  }
}

function hasGcloud(): boolean {
  try {
    execSync("which gcloud", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

interface ConfigData {
  env: Record<string, string>;
  deploy: Record<string, string>;
  [key: string]: unknown;
}

function main(data: ConfigData) {
  const env = data.env ?? {};
  const deploy = data.deploy ?? {};
  const projectId = deploy.GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || "";

  if (!hasGcloud()) {
    process.stdout.write(JSON.stringify(data, null, 2));
    return;
  }

  // Resolve REPLACE_WITH_GCP_SECRET placeholders in env: block.
  for (const [key, val] of Object.entries(env)) {
    if (typeof val !== "string" || !val.includes(PLACEHOLDER)) continue;
    const secretName = secretNameFor(key, env, deploy);
    if (!secretName) {
      process.stderr.write(
        `resolve_secrets: no secret mapping for ${key}; leaving as placeholder\n`,
      );
      continue;
    }
    const fetched = fetch(secretName, projectId);
    if (fetched === undefined) continue;
    env[key] =
      val === PLACEHOLDER ? fetched : val.replace(PLACEHOLDER, fetched);
  }

  // Construct R2-backed URLs from r2-account-id + bucket directory inputs.
  const getInput = (name: string) => deploy[name] || env[name] || "";

  const snapshotDir = getInput("SNAPSHOT_BUCKET_DIRECTORY");
  const blobDir = getInput("BLOB_BUCKET_DIRECTORY");
  const txDir = getInput("TX_FILE_STORE_BUCKET_DIRECTORY");

  if (snapshotDir || blobDir || txDir) {
    const r2 = fetch("r2-account-id", projectId);
    if (r2) {
      if (snapshotDir) {
        env.STORE_SNAPSHOT_URL =
          `s3://testnet-bucket/${snapshotDir}/?endpoint=https://${r2}.r2.cloudflarestorage.com` +
          `&publicBaseUrl=https://aztec-labs-snapshots.com`;
      }
      if (blobDir) {
        env.BLOB_FILE_STORE_UPLOAD_URL = `s3://testnet-bucket/${blobDir}/?endpoint=https://${r2}.r2.cloudflarestorage.com`;
      }
      if (txDir) {
        env.TX_FILE_STORE_URL = `s3://testnet-bucket/${txDir}/?endpoint=https://${r2}.r2.cloudflarestorage.com`;
      }
    }
  }

  process.stdout.write(JSON.stringify(data, null, 2));
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => (input += chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(input) as ConfigData;
  main(data);
});
