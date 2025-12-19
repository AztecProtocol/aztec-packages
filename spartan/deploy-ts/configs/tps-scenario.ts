/**
 * TPS-scenario network configuration.
 * For high-throughput benchmarking on GKE private cluster.
 */

import type { NetworkConfig } from "./types.ts";
import {
  DEFAULT_ROLLUP_CONFIG,
  DEFAULT_GOVERNANCE_CONFIG,
  DEFAULT_GSE_CONFIG,
  DEFAULT_GOVERNANCE_PROPOSER_CONFIG,
  DEFAULT_ZKPASSPORT_CONFIG,
} from "./defaults.ts";

const config: NetworkConfig = {
  name: "tps-scenario",

  ethereum: {
    chainId: 1337,
    rpcUrls: [], // Will be populated from ETH devnet deployment
    consensusHostUrls: [],
    consensusHostApiKeys: [],
    consensusHostApiKeyHeaders: [],
    blockTime: 12,
    gasLimit: 100_000_000,
  },

  gcp: {
    projectId: "testnet-440309",
    region: "us-west1-a",
  },

  kubernetes: {
    cluster: "aztec-gke-private",
    namespace: "tps-scenario", // Overridden by CLI
    resourceProfile: "prod",
  },

  secrets: {
    labsInfraMnemonic: "test test test test test test test test test test test junk",
    otelCollectorEndpoint: undefined, // From GCP secrets
  },

  deployEthDevnet: true,
  deployRollupContracts: true,
  deployAztecInfra: true,
  realVerifier: false,
  testAccounts: true,
  sponsoredFpc: true,
  verifyContracts: false,

  validators: {
    replicas: 12,
    validatorsPerNode: 4,
    mnemonicStartIndex: 1,
    publisherMnemonicStartIndex: 5000,
    publishersPerValidatorKey: 2,
  },

  provers: {
    replicas: 64,
    agentsPerProver: 1,
    mnemonicStartIndex: 8000,
    publishersPerProver: 2,
    realProofs: false,
    agentPollIntervalMs: 10000,
    resourceProfile: "hi-tps",
    testDelayType: "fixed",
    testVerificationDelayMs: 250,
    includeMetrics: "aztec.circuit",
  },

  bots: {
    transfersReplicas: 0,
    transfersMnemonicStartIndex: 7000,
    transfersTxIntervalSeconds: 60,
    transfersFollowChain: "NONE",
    transfersL2PrivateKey: "0xcafe01",
    swapsReplicas: 0,
    swapsMnemonicStartIndex: 7100,
    swapsTxIntervalSeconds: 60,
    swapsFollowChain: "NONE",
    swapsL2PrivateKey: "0xcafe02",
  },

  rpc: {
    replicas: 10,
    ingressEnabled: false,
  },

  fullNodes: {
    replicas: 500,
    resourceProfile: "2-core-spot",
    includeMetrics: "aztec.p2p.gossip.agg_",
  },

  bootnode: {
    deployInternal: true,
  },

  p2p: {
    maxTxPoolSize: 1_000_000_000,
    txPoolDeleteTxsAfterReorg: false,
    gossipsubD: 6,
    gossipsubDLo: 4,
    gossipsubDHi: 12,
    dropTx: false,
    dropTxChance: 0,
    debugInstrumentMessages: true,
  },

  sequencer: {
    minTxPerBlock: 0,
    maxTxPerBlock: 80,
  },

  fisherman: {
    mode: "disabled",
    mnemonicStartIndex: 1,
  },

  sentinel: {
    enabled: false,
  },

  rollup: {
    ...DEFAULT_ROLLUP_CONFIG,
    aztecSlotDuration: 72,
    aztecEpochDuration: 8,
    aztecProofSubmissionEpochs: 2,
    lagInEpochsForValidatorSet: 1,
    lagInEpochsForRandao: 1,
    localEjectionThreshold: 90_000n * 10n ** 18n,
    slashingQuorum: 5,
    slashingRoundSize: 8, // 1 epoch
    slashingExecutionDelayInRounds: 0,
    slashingOffsetInRounds: 1,
  },

  governance: DEFAULT_GOVERNANCE_CONFIG,
  gse: DEFAULT_GSE_CONFIG,
  governanceProposer: DEFAULT_GOVERNANCE_PROPOSER_CONFIG,
  zkPassport: DEFAULT_ZKPASSPORT_CONFIG,

  logLevel: "info",
};

export default config;
