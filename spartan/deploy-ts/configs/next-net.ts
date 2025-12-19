/**
 * Next-net network configuration.
 * This replaces spartan/environments/next-net.env
 */

import type { NetworkConfig } from "./types.ts";
import { GCP_SECRET } from "./types.ts";
import {
  DEFAULT_ROLLUP_CONFIG,
  DEFAULT_GOVERNANCE_CONFIG,
  DEFAULT_GSE_CONFIG,
  DEFAULT_GOVERNANCE_PROPOSER_CONFIG,
  DEFAULT_ZKPASSPORT_CONFIG,
} from "./defaults.ts";

const config: NetworkConfig = {
  name: "next-net",

  ethereum: {
    chainId: 11155111, // Sepolia
    rpcUrls: GCP_SECRET,
    consensusHostUrls: GCP_SECRET,
    consensusHostApiKeys: GCP_SECRET,
    consensusHostApiKeyHeaders: GCP_SECRET,
    blockTime: 12,
    gasLimit: 100_000_000,
  },

  gcp: {
    projectId: "testnet-440309",
    region: "us-west1-a",
  },

  kubernetes: {
    cluster: "aztec-gke-private",
    namespace: "next-net",
    resourceProfile: "prod",
  },

  secrets: {
    labsInfraMnemonic: GCP_SECRET,
    rollupDeploymentPrivateKey: GCP_SECRET,
    otelCollectorEndpoint: GCP_SECRET,
    etherscanApiKey: GCP_SECRET,
    r2AccessKeyId: GCP_SECRET,
    r2SecretAccessKey: GCP_SECRET,
  },

  deployEthDevnet: false,
  deployRollupContracts: true,
  deployAztecInfra: true,
  realVerifier: false,
  testAccounts: true,
  sponsoredFpc: true,
  verifyContracts: false,

  validators: {
    replicas: 4,
    validatorsPerNode: 12,
    mnemonicStartIndex: 1,
    publisherMnemonicStartIndex: 5000,
    publishersPerValidatorKey: 2,
  },

  provers: {
    replicas: 1,
    agentsPerProver: 4,
    mnemonicStartIndex: 8000,
    publishersPerProver: 2,
    realProofs: false,
    agentPollIntervalMs: 1000,
    failedProofStore: "gs://aztec-develop/next-net/failed-proofs",
  },

  bots: {
    transfersReplicas: 1,
    transfersMnemonicStartIndex: 7000,
    transfersTxIntervalSeconds: 250,
    transfersFollowChain: "PENDING",
    transfersL2PrivateKey: "0xcafe01",
    swapsReplicas: 1,
    swapsMnemonicStartIndex: 7100,
    swapsTxIntervalSeconds: 350,
    swapsFollowChain: "PENDING",
    swapsL2PrivateKey: "0xcafe02",
  },

  rpc: {
    replicas: 2,
    ingressEnabled: true,
    ingressHost: "next-net.aztec-labs.com",
    ingressStaticIpName: "next-net-rpc-ip",
    ingressSslCertName: "next-net-rpc-cert",
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
  },

  governance: DEFAULT_GOVERNANCE_CONFIG,
  gse: DEFAULT_GSE_CONFIG,
  governanceProposer: DEFAULT_GOVERNANCE_PROPOSER_CONFIG,
  zkPassport: DEFAULT_ZKPASSPORT_CONFIG,

  logLevel: "info",
};

export default config;
