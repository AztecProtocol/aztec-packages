#!/usr/bin/env node
/**
 * Network management CLI.
 *
 * Usage:
 *   node --experimental-strip-types main.ts deploy [--plan] <networkLabel> <namespace> [aztecDockerImage]
 *   node --experimental-strip-types main.ts teardown [--plan] <networkLabel> <namespace>
 *
 * Networks: local, devnet, testnet, next-scenario, tps-scenario
 *
 * Examples:
 *   node --experimental-strip-types main.ts deploy next-scenario my-branch
 *   node --experimental-strip-types main.ts deploy --plan devnet devnet aztecprotocol/aztec:0.87.0
 *   node --experimental-strip-types main.ts teardown next-scenario my-branch
 */

import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { NetworkConfig } from "./networks/types.ts";
import { deploy } from "./deploy/deploy.ts";
import { teardown } from "./deploy/teardown.ts";
import { RealExecutor, PlanExecutor } from "./deploy/executor.ts";

const REPO_ROOT = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" }).stdout.trim();
const SPARTAN_DIR = resolve(REPO_ROOT, "spartan");

const NETWORK_CONFIGS: Record<string, string> = {
  local: "./networks/local.ts",
  devnet: "./networks/devnet.ts",
  testnet: "./networks/testnet.ts",
  "next-scenario": "./networks/next-scenario.ts",
  "tps-scenario": "./networks/tps-scenario.ts",
};

async function loadNetworkConfig(networkLabel: string): Promise<NetworkConfig> {
  const configRelPath = NETWORK_CONFIGS[networkLabel];
  if (!configRelPath) {
    console.error(`Unknown network: ${networkLabel}. Available: ${Object.keys(NETWORK_CONFIGS).join(", ")}`);
    process.exit(1);
  }

  const configPath = resolve(import.meta.dirname!, configRelPath);
  const module = await import(configPath);
  return module.default ?? module.config;
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  node --experimental-strip-types main.ts deploy [--plan] <networkLabel> <namespace> [aztecDockerImage]");
  console.log("  node --experimental-strip-types main.ts teardown [--plan] <networkLabel> <namespace>");
  console.log("");
  console.log("Networks: " + Object.keys(NETWORK_CONFIGS).join(", "));
  console.log("");
  console.log("Options:");
  console.log("  --plan    Print plan without executing");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];
  const restArgs = args.slice(1);

  // Parse --plan flag
  const planMode = restArgs.includes("--plan");
  const filteredArgs = restArgs.filter(a => a !== "--plan");

  if (command === "deploy") {
    if (filteredArgs.length < 2) {
      console.log("Usage: node --experimental-strip-types main.ts deploy [--plan] <networkLabel> <namespace> [aztecDockerImage]");
      process.exit(1);
    }

    const [networkLabel, namespace, aztecDockerImage] = filteredArgs;
    const dockerImage = aztecDockerImage ?? process.env["AZTEC_DOCKER_IMAGE"] ?? "";

    if (!dockerImage && !planMode) {
      console.error("Error: aztecDockerImage argument or AZTEC_DOCKER_IMAGE env var required");
      process.exit(1);
    }

    const config = await loadNetworkConfig(networkLabel!);
    config.kubernetes.namespace = namespace!;

    const exec = planMode ? new PlanExecutor() : new RealExecutor(SPARTAN_DIR);
    deploy(config, exec, dockerImage);

    if (exec instanceof PlanExecutor) {
      exec.printPlan();
    }
  } else if (command === "teardown") {
    if (filteredArgs.length < 2) {
      console.log("Usage: node --experimental-strip-types main.ts teardown [--plan] <networkLabel> <namespace>");
      process.exit(1);
    }

    const [networkLabel, namespace] = filteredArgs;

    const config = await loadNetworkConfig(networkLabel!);
    config.kubernetes.namespace = namespace!;

    const exec = planMode ? new PlanExecutor() : new RealExecutor(SPARTAN_DIR);
    teardown(config, exec);

    if (exec instanceof PlanExecutor) {
      exec.printPlan();
    }
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
