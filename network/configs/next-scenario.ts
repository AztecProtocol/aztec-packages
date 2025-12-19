/**
 * Next-scenario network configuration.
 * For CI end-to-end testing on GKE private cluster.
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
  name: "next-scenario",

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
    namespace: "scenario", // Overridden by CLI
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
    replicas: 1,
    validatorsPerNode: 1,
    mnemonicStartIndex: 1,
    publisherMnemonicStartIndex: 5000,
    publishersPerValidatorKey: 1,
  },

  provers: {
    replicas: 1,
    agentsPerProver: 1,
    mnemonicStartIndex: 8000,
    publishersPerProver: 1,
    realProofs: false,
    agentPollIntervalMs: 1000,
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
    replicas: 2,
    ingressEnabled: false,
  },

  fullNodes: {
    replicas: 0,
  },

  bootnode: {
    deployInternal: true,
  },

  p2p: {
    maxTxPoolSize: 100_000_000,
    txPoolDeleteTxsAfterReorg: false,
    gossipsubD: 6,
    gossipsubDLo: 4,
    gossipsubDHi: 12,
    dropTx: false,
    dropTxChance: 0,
    debugInstrumentMessages: false,
  },

  sequencer: {
    minTxPerBlock: 0,
    maxTxPerBlock: 8,
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
    aztecEpochDuration: 32,
    lagInEpochsForValidatorSet: 2,
    lagInEpochsForRandao: 2,
    localEjectionThreshold: 90_000n * 10n ** 18n,
    slashingQuorum: 17,
    slashingRoundSize: 32, // 1 epoch
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
