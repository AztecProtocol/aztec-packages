import { describe, it } from "node:test";
import assert from "node:assert";
import { deploy } from "../deploy/deploy.ts";
import { teardown } from "../deploy/teardown.ts";
import { PlanExecutor } from "../deploy/executor.ts";
import type { NetworkConfig } from "../configs/types.ts";
import { DEFAULT_ROLLUP_CONFIG, DEFAULT_GSE_CONFIG, DEFAULT_GOVERNANCE_PROPOSER_CONFIG, DEFAULT_GOVERNANCE_CONFIG, DEFAULT_ZKPASSPORT_CONFIG } from "../configs/defaults.ts";

/** Minimal config for testing */
function makeTestConfig(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return {
    name: "test-network",
    ethereum: {
      chainId: 1337,
      rpcUrls: ["http://localhost:8545"],
      consensusHostUrls: ["http://localhost:5052"],
      consensusHostApiKeys: [],
      consensusHostApiKeyHeaders: [],
      blockTime: 12,
      gasLimit: 30000000,
    },
    gcp: {
      projectId: "test-project",
      region: "us-central1",
    },
    kubernetes: {
      cluster: "test-cluster",
      namespace: "test-ns",
      resourceProfile: "dev",
    },
    validators: {
      replicas: 1,
      validatorsPerNode: 1,
      publishersPerValidatorKey: 1,
      mnemonicStartIndex: 1,
      publisherMnemonicStartIndex: 5000,
    },
    provers: {
      replicas: 1,
      realProofs: false,
      agentsPerProver: 1,
      agentPollIntervalMs: 1000,
      mnemonicStartIndex: 8000,
      publishersPerProver: 1,
    },
    bootnode: {
      deployInternal: true,
    },
    sequencer: {
      minTxPerBlock: 0,
      maxTxPerBlock: 32,
    },
    rpc: {
      replicas: 1,
      ingressEnabled: false,
    },
    fullNodes: {
      replicas: 0,
    },
    bots: {
      transfersReplicas: 0,
      transfersMnemonicStartIndex: 100,
      transfersTxIntervalSeconds: 60,
      transfersFollowChain: "NONE",
      transfersL2PrivateKey: "",
      swapsReplicas: 0,
      swapsMnemonicStartIndex: 200,
      swapsTxIntervalSeconds: 60,
      swapsFollowChain: "NONE",
      swapsL2PrivateKey: "",
    },
    p2p: {
      maxTxPoolSize: 1000,
      txPoolDeleteTxsAfterReorg: true,
      debugInstrumentMessages: false,
      gossipsubD: 8,
      gossipsubDLo: 6,
      gossipsubDHi: 12,
      dropTx: false,
      dropTxChance: 0,
    },
    sentinel: {
      enabled: false,
    },
    fisherman: {
      mode: "disabled",
      mnemonicStartIndex: 0,
    },
    rollup: DEFAULT_ROLLUP_CONFIG,
    gse: DEFAULT_GSE_CONFIG,
    governance: DEFAULT_GOVERNANCE_CONFIG,
    governanceProposer: DEFAULT_GOVERNANCE_PROPOSER_CONFIG,
    zkPassport: DEFAULT_ZKPASSPORT_CONFIG,
    secrets: {
      labsInfraMnemonic: "test test test test test test test test test test test junk",
    },
    sponsoredFpc: false,
    testAccounts: true,
    realVerifier: false,
    deployEthDevnet: true,
    deployRollupContracts: true,
    deployAztecInfra: true,
    verifyContracts: false,
    logLevel: "info",
    ...overrides,
  };
}

void describe("deploy", () => {
  void it("should plan all three stages when all are enabled", () => {
    const config = makeTestConfig();
    const exec = new PlanExecutor();

    deploy(config, exec, "aztec:latest");

    // Should have terraform applies for all 3 stages
    assert.strictEqual(exec.terraformApplies.length, 3);
    assert.strictEqual(exec.terraformApplies[0]?.module, "deploy-eth-devnet");
    assert.strictEqual(exec.terraformApplies[1]?.module, "deploy-rollup-contracts");
    assert.strictEqual(exec.terraformApplies[2]?.module, "deploy-aztec-infra");

    // Should create namespace
    assert.ok(exec.operations.some(op => op.includes("create namespace")));
  });

  void it("should skip ETH devnet when not enabled", () => {
    const config = makeTestConfig({ deployEthDevnet: false });
    const exec = new PlanExecutor();

    deploy(config, exec, "aztec:latest");

    assert.strictEqual(exec.terraformApplies.length, 2);
    assert.strictEqual(exec.terraformApplies[0]?.module, "deploy-rollup-contracts");
    assert.strictEqual(exec.terraformApplies[1]?.module, "deploy-aztec-infra");
  });

  void it("should skip rollup contracts when not enabled", () => {
    const config = makeTestConfig({ deployRollupContracts: false });
    const exec = new PlanExecutor();

    deploy(config, exec, "aztec:latest");

    assert.strictEqual(exec.terraformApplies.length, 2);
    assert.strictEqual(exec.terraformApplies[0]?.module, "deploy-eth-devnet");
    assert.strictEqual(exec.terraformApplies[1]?.module, "deploy-aztec-infra");
  });

  void it("should skip aztec infra when not enabled", () => {
    const config = makeTestConfig({ deployAztecInfra: false });
    const exec = new PlanExecutor();

    deploy(config, exec, "aztec:latest");

    assert.strictEqual(exec.terraformApplies.length, 2);
    assert.strictEqual(exec.terraformApplies[0]?.module, "deploy-eth-devnet");
    assert.strictEqual(exec.terraformApplies[1]?.module, "deploy-rollup-contracts");
  });

  void it("should pass docker image to rollup contracts", () => {
    const config = makeTestConfig();
    const exec = new PlanExecutor();

    deploy(config, exec, "aztec:v1.2.3");

    const rollupApply = exec.terraformApplies.find(a => a.module === "deploy-rollup-contracts");
    assert.ok(rollupApply);
    assert.strictEqual(rollupApply.vars.AZTEC_DOCKER_IMAGE, "aztec:v1.2.3");
  });
});

void describe("teardown", () => {
  void it("should destroy in reverse order", () => {
    const config = makeTestConfig();
    const exec = new PlanExecutor();

    teardown(config, exec);

    assert.strictEqual(exec.terraformDestroys.length, 3);
    assert.strictEqual(exec.terraformDestroys[0], "deploy-aztec-infra");
    assert.strictEqual(exec.terraformDestroys[1], "deploy-rollup-contracts");
    assert.strictEqual(exec.terraformDestroys[2], "deploy-eth-devnet");

    // Should delete namespace
    assert.ok(exec.operations.some(op => op.includes("delete namespace")));
  });

  void it("should skip stages that were not deployed", () => {
    const config = makeTestConfig({
      deployEthDevnet: false,
      deployRollupContracts: true,
      deployAztecInfra: true,
    });
    const exec = new PlanExecutor();

    teardown(config, exec);

    assert.strictEqual(exec.terraformDestroys.length, 2);
    assert.strictEqual(exec.terraformDestroys[0], "deploy-aztec-infra");
    assert.strictEqual(exec.terraformDestroys[1], "deploy-rollup-contracts");
  });
});
