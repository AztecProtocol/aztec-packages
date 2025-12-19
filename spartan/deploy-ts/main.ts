#!/usr/bin/env node
/**
 * Network management CLI.
 *
 * Usage:
 *   node --experimental-strip-types main.ts deploy [--plan] <config> <namespace> <aztecDockerImage>
 *   node --experimental-strip-types main.ts teardown [--plan] <config> <namespace>
 *   node --experimental-strip-types main.ts export-env <config> <namespace>
 *
 * Config can be a short label (local, devnet, testnet, next-scenario, tps-scenario)
 * or a path to a config file.
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { NetworkConfig } from "./configs/types.ts";
import { deploy } from "./deploy/deploy.ts";
import { teardown } from "./deploy/teardown.ts";
import { RealExecutor, PlanExecutor } from "./deploy/executor.ts";

const REPO_ROOT = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" }).stdout.trim();
const SPARTAN_DIR = resolve(REPO_ROOT, "spartan");
const CONFIGS_DIR = resolve(import.meta.dirname!, "configs");

async function loadConfig(configArg: string): Promise<NetworkConfig> {
  let configPath: string;

  // Check if it's a path (contains / or ends with .ts)
  if (configArg.includes("/") || configArg.endsWith(".ts")) {
    configPath = resolve(configArg);
  } else {
    // Short label - look in configs/
    configPath = resolve(CONFIGS_DIR, `${configArg}.ts`);
  }

  if (!existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const module = await import(configPath);
  return module.default ?? module.config;
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  node --experimental-strip-types main.ts deploy [--plan] <config> <namespace> <aztecDockerImage>");
  console.log("  node --experimental-strip-types main.ts teardown [--plan] <config> <namespace>");
  console.log("  node --experimental-strip-types main.ts export-env <config> <namespace>");
  console.log("");
  console.log("Config: short label (local, devnet, testnet, next-scenario, tps-scenario) or path to .ts file");
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
    if (filteredArgs.length < 3) {
      console.log("Usage: node --experimental-strip-types main.ts deploy [--plan] <config> <namespace> <aztecDockerImage>");
      process.exit(1);
    }

    const [configArg, namespace, aztecDockerImage] = filteredArgs;

    const config = await loadConfig(configArg!);
    config.kubernetes.namespace = namespace!;

    const exec = planMode ? new PlanExecutor() : new RealExecutor(SPARTAN_DIR);
    deploy(config, exec, aztecDockerImage!);

    if (exec instanceof PlanExecutor) {
      exec.printPlan();
    }
  } else if (command === "teardown") {
    if (filteredArgs.length < 2) {
      console.log("Usage: node --experimental-strip-types main.ts teardown [--plan] <config> <namespace>");
      process.exit(1);
    }

    const [configArg, namespace] = filteredArgs;

    const config = await loadConfig(configArg!);
    config.kubernetes.namespace = namespace!;

    const exec = planMode ? new PlanExecutor() : new RealExecutor(SPARTAN_DIR);
    teardown(config, exec);

    if (exec instanceof PlanExecutor) {
      exec.printPlan();
    }
  } else if (command === "export-env") {
    if (filteredArgs.length < 2) {
      console.log("Usage: node --experimental-strip-types main.ts export-env <config> <namespace>");
      process.exit(1);
    }

    const [configArg, namespace] = filteredArgs;

    const config = await loadConfig(configArg!);
    config.kubernetes.namespace = namespace!;

    // Helper to output env var (only outputs if value is defined)
    const exportVar = (name: string, value: string | number | boolean | bigint | undefined | null) => {
      if (value !== undefined && value !== null) {
        console.log(`export ${name}="${value}"`);
      }
    };

    // Output all environment variables that are in EnvVar type from foundation/src/config/env_var.ts
    // This ensures we only export known, valid environment variable names

    // === Test/Scenario Variables ===
    exportVar("NAMESPACE", config.kubernetes.namespace);
    exportVar("SCENARIO_TESTS", "1");

    // === Network ===
    exportVar("NETWORK", config.name);

    // === Ethereum/L1 ===
    exportVar("L1_CHAIN_ID", config.ethereum.chainId);
    exportVar("ETHEREUM_SLOT_DURATION", config.ethereum.blockTime);
    if (config.ethereum.rpcUrls.length > 0) {
      exportVar("ETHEREUM_HOSTS", JSON.stringify(config.ethereum.rpcUrls));
    }
    if (config.ethereum.consensusHostUrls.length > 0) {
      exportVar("L1_CONSENSUS_HOST_URLS", JSON.stringify(config.ethereum.consensusHostUrls));
    }
    if (config.ethereum.consensusHostApiKeys.length > 0) {
      exportVar("L1_CONSENSUS_HOST_API_KEYS", JSON.stringify(config.ethereum.consensusHostApiKeys));
    }
    if (config.ethereum.consensusHostApiKeyHeaders.length > 0) {
      exportVar("L1_CONSENSUS_HOST_API_KEY_HEADERS", JSON.stringify(config.ethereum.consensusHostApiKeyHeaders));
    }

    // === Rollup Configuration ===
    exportVar("AZTEC_SLOT_DURATION", config.rollup.aztecSlotDuration);
    exportVar("AZTEC_EPOCH_DURATION", config.rollup.aztecEpochDuration);
    exportVar("AZTEC_TARGET_COMMITTEE_SIZE", config.rollup.targetCommitteeSize);
    exportVar("AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET", config.rollup.lagInEpochsForValidatorSet);
    exportVar("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO", config.rollup.lagInEpochsForRandao);
    exportVar("AZTEC_PROOF_SUBMISSION_EPOCHS", config.rollup.aztecProofSubmissionEpochs);
    exportVar("AZTEC_LOCAL_EJECTION_THRESHOLD", config.rollup.localEjectionThreshold);
    exportVar("AZTEC_SLASHING_QUORUM", config.rollup.slashingQuorum);
    exportVar("AZTEC_SLASHING_LIFETIME_IN_ROUNDS", config.rollup.slashingLifetimeInRounds);
    exportVar("AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS", config.rollup.slashingExecutionDelayInRounds);
    exportVar("AZTEC_SLASHING_OFFSET_IN_ROUNDS", config.rollup.slashingOffsetInRounds);
    exportVar("AZTEC_SLASHING_DISABLE_DURATION", config.rollup.slashingDisableDuration);
    exportVar("AZTEC_SLASH_AMOUNT_SMALL", config.rollup.slashAmounts.small);
    exportVar("AZTEC_SLASH_AMOUNT_MEDIUM", config.rollup.slashAmounts.medium);
    exportVar("AZTEC_SLASH_AMOUNT_LARGE", config.rollup.slashAmounts.large);
    exportVar("AZTEC_SLASHER_FLAVOR", config.rollup.slasherFlavor);
    exportVar("AZTEC_SLASHING_VETOER", config.rollup.slashingVetoer);
    exportVar("AZTEC_MANA_TARGET", config.rollup.manaTarget);
    exportVar("AZTEC_PROVING_COST_PER_MANA", config.rollup.provingCostPerMana);
    exportVar("AZTEC_EXIT_DELAY_SECONDS", config.rollup.exitDelaySeconds);

    // === GSE Configuration ===
    exportVar("AZTEC_ACTIVATION_THRESHOLD", config.gse.activationThreshold);
    exportVar("AZTEC_EJECTION_THRESHOLD", config.gse.ejectionThreshold);

    // === Governance Proposer ===
    exportVar("AZTEC_GOVERNANCE_PROPOSER_QUORUM", config.governanceProposer.quorum);
    exportVar("AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE", config.governanceProposer.roundSize);

    // === Secrets/Keys ===
    exportVar("MNEMONIC", config.secrets.labsInfraMnemonic);

    // === Deployment Flags ===
    exportVar("TEST_ACCOUNTS", config.testAccounts);
    exportVar("SPONSORED_FPC", config.sponsoredFpc);
    exportVar("PROVER_REAL_PROOFS", config.provers.realProofs);

    // === P2P Configuration ===
    exportVar("P2P_MAX_TX_POOL_SIZE", config.p2p.maxTxPoolSize);
    exportVar("P2P_TX_POOL_DELETE_TXS_AFTER_REORG", config.p2p.txPoolDeleteTxsAfterReorg);
    exportVar("P2P_GOSSIPSUB_D", config.p2p.gossipsubD);
    exportVar("P2P_GOSSIPSUB_DLO", config.p2p.gossipsubDLo);
    exportVar("P2P_GOSSIPSUB_DHI", config.p2p.gossipsubDHi);
    exportVar("P2P_DROP_TX", config.p2p.dropTx);
    exportVar("P2P_DROP_TX_CHANCE", config.p2p.dropTxChance);
    exportVar("DEBUG_P2P_INSTRUMENT_MESSAGES", config.p2p.debugInstrumentMessages);

    // === Sequencer Configuration ===
    exportVar("SEQ_MIN_TX_PER_BLOCK", config.sequencer.minTxPerBlock);
    exportVar("SEQ_MAX_TX_PER_BLOCK", config.sequencer.maxTxPerBlock);

    // === Prover Configuration ===
    exportVar("PROVER_AGENT_POLL_INTERVAL_MS", config.provers.agentPollIntervalMs);
    exportVar("PROVER_FAILED_PROOF_STORE", config.provers.failedProofStore);
    exportVar("PROVER_TEST_DELAY_TYPE", config.provers.testDelayType);
    exportVar("PROVER_TEST_VERIFICATION_DELAY_MS", config.provers.testVerificationDelayMs);
    exportVar("PROVER_NODE_DISABLE_PROOF_PUBLISH", config.provers.disableProofPublish);

    // === Sentinel Configuration ===
    exportVar("SENTINEL_ENABLED", config.sentinel.enabled);
    exportVar("SLASH_MIN_PENALTY_PERCENTAGE", config.sentinel.minPenaltyPercentage);
    exportVar("SLASH_MAX_PENALTY_PERCENTAGE", config.sentinel.maxPenaltyPercentage);
    exportVar("SLASH_INACTIVITY_TARGET_PERCENTAGE", config.sentinel.inactivityTargetPercentage);
    exportVar("SLASH_INACTIVITY_PENALTY", config.sentinel.inactivityPenalty);
    exportVar("SLASH_PRUNE_PENALTY", config.sentinel.prunePenalty);
    exportVar("SLASH_DATA_WITHHOLDING_PENALTY", config.sentinel.dataWithholdingPenalty);
    exportVar("SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY", config.sentinel.proposeInvalidAttestationsPenalty);
    exportVar("SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY", config.sentinel.attestDescendantOfInvalidPenalty);
    exportVar("SLASH_UNKNOWN_PENALTY", config.sentinel.unknownPenalty);
    exportVar("SLASH_INVALID_BLOCK_PENALTY", config.sentinel.invalidBlockPenalty);
    exportVar("SLASH_OFFENSE_EXPIRATION_ROUNDS", config.sentinel.offenseExpirationRounds);
    exportVar("SLASH_MAX_PAYLOAD_SIZE", config.sentinel.maxPayloadSize);

    // === Fisherman Configuration ===
    exportVar("FISHERMAN_MODE", config.fisherman.mode);

    // === Logging ===
    exportVar("LOG_LEVEL", config.logLevel);

    // === Additional flags ===
    exportVar("TRANSACTIONS_DISABLED", config.transactionsDisabled);
    exportVar("BLOB_ALLOW_EMPTY_SOURCES", config.blobAllowEmptySources);
    exportVar("WS_NUM_HISTORIC_BLOCKS", config.wsNumHistoricBlocks);

    // === Dynamic values from deployed infrastructure ===
    // L1 RPC URLs - get from kubectl if eth-devnet was deployed
    if (config.deployEthDevnet) {
      const result = spawnSync("kubectl", [
        "get", "svc", "eth-devnet-geth", "-n", namespace!,
        "-o", "jsonpath={.status.loadBalancer.ingress[0].ip}"
      ], { encoding: "utf-8" });
      if (result.status === 0 && result.stdout.trim()) {
        const ip = result.stdout.trim();
        exportVar("ETHEREUM_HOSTS", `["http://${ip}:8545"]`);
      }
    }

    // Contract addresses - get from deployed rollup contracts
    const getContractAddress = (configMapKey: string) => {
      const result = spawnSync("kubectl", [
        "get", "configmap", "rollup-contracts", "-n", namespace!,
        "-o", `jsonpath={.data.${configMapKey}}`
      ], { encoding: "utf-8" });
      return result.status === 0 ? result.stdout.trim() : "";
    };

    const registryAddress = getContractAddress("REGISTRY_CONTRACT_ADDRESS");
    if (registryAddress) {
      exportVar("REGISTRY_CONTRACT_ADDRESS", registryAddress);
    }

    const feeAssetHandlerAddress = getContractAddress("FEE_ASSET_HANDLER_CONTRACT_ADDRESS");
    if (feeAssetHandlerAddress) {
      exportVar("FEE_ASSET_HANDLER_CONTRACT_ADDRESS", feeAssetHandlerAddress);
    }

    const slashFactoryAddress = getContractAddress("SLASH_FACTORY_CONTRACT_ADDRESS");
    if (slashFactoryAddress) {
      exportVar("SLASH_FACTORY_CONTRACT_ADDRESS", slashFactoryAddress);
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
