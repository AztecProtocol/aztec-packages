/**
 * Devnet network configuration.
 * This replaces spartan/environments/devnet.env
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
  name: "devnet",

  ethereum: {
    chainId: 11155111, // Sepolia
    rpcUrls: [], // Populated from secrets
    consensusHostUrls: [], // Populated from secrets
    consensusHostApiKeys: [], // Populated from secrets
    consensusHostApiKeyHeaders: [], // Populated from secrets
    blockTime: 12,
    gasLimit: 100_000_000,
  },

  gcp: {
    projectId: "testnet-440309",
    region: "us-west1-a",
  },

  kubernetes: {
    cluster: "aztec-gke-private",
    namespace: "devnet",
    resourceProfile: "prod",
  },

  secrets: {
    labsInfraMnemonic: "", // From GCP secrets
    rollupDeploymentPrivateKey: undefined, // From GCP secrets
    otelCollectorEndpoint: undefined, // From GCP secrets
  },

  deployEthDevnet: false,
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
    agentsPerProver: 4,
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
    replicas: 1,
    ingressEnabled: true,
    ingressHost: "devnet.aztec-labs.com",
    ingressStaticIpName: "devnet-rpc-ip",
    ingressSslCertName: "devnet-rpc-cert",
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
    maxTxPerBlock: 32,
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
    lagInEpochsForValidatorSet: 1,
    lagInEpochsForRandao: 1,
    aztecEpochDuration: 8,
  },

  governance: DEFAULT_GOVERNANCE_CONFIG,
  gse: DEFAULT_GSE_CONFIG,
  governanceProposer: DEFAULT_GOVERNANCE_PROPOSER_CONFIG,
  zkPassport: DEFAULT_ZKPASSPORT_CONFIG,

  logLevel: "info",
  wsNumHistoricBlocks: 300,
};

export default config;
