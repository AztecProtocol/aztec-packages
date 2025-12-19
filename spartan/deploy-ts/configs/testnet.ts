/**
 * Testnet network configuration.
 * This replaces spartan/environments/testnet.env
 */

import { days, type NetworkConfig } from "./types.ts";
import { DEFAULT_ROLLUP_CONFIG, DEFAULT_ZKPASSPORT_CONFIG } from "./defaults.ts";

const config: NetworkConfig = {
  name: "testnet",

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
    cluster: "aztec-gke-public",
    namespace: "testnet",
    resourceProfile: "prod",
  },

  secrets: {
    labsInfraMnemonic: "", // From GCP secrets
    rollupDeploymentPrivateKey: undefined, // From GCP secrets
    otelCollectorEndpoint: undefined, // From GCP secrets
    etherscanApiKey: undefined, // From GCP secrets
    r2AccessKeyId: undefined, // From GCP secrets
    r2SecretAccessKey: undefined, // From GCP secrets
  },

  deployEthDevnet: false,
  deployRollupContracts: true,
  deployAztecInfra: true,
  realVerifier: true,
  testAccounts: false,
  sponsoredFpc: true,
  verifyContracts: true,

  validators: {
    replicas: 4,
    validatorsPerNode: 20,
    mnemonicStartIndex: 1,
    publisherMnemonicStartIndex: 5000,
    publishersPerValidatorKey: 2,
  },

  provers: {
    replicas: 0, // Testnet doesn't deploy provers via this config
    agentsPerProver: 1,
    mnemonicStartIndex: 8000,
    publishersPerProver: 2,
    realProofs: true,
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
    ingressHost: "rpc.testnet.aztec-labs.com",
    ingressStaticIpName: "testnet-rpc-ip",
    ingressSslCertName: "testnet-rpc-cert",
  },

  fullNodes: {
    replicas: 0,
  },

  bootnode: {
    deployInternal: false,
  },

  p2p: {
    maxTxPoolSize: 100_000_000,
    txPoolDeleteTxsAfterReorg: true,
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
    aztecSlotDuration: 72,
    aztecEpochDuration: 32,
    targetCommitteeSize: 48,
    lagInEpochsForValidatorSet: 2,
    lagInEpochsForRandao: 2,
    aztecProofSubmissionEpochs: 1,
    localEjectionThreshold: 199_000n * 10n ** 18n,
    slashingQuorum: 33,
    slashingRoundSize: 64, // 2 * 32
    slashingOffsetInRounds: 2,
    slashingLifetimeInRounds: 5,
    slashingExecutionDelayInRounds: 2,
    slashingVetoer: "0xdfe19Da6a717b7088621d8bBB66be59F2d78e924",
    manaTarget: 150_000_000,
    stakingQueue: {
      bootstrapValidatorSetSize: 48,
      bootstrapFlushSize: 48,
      normalFlushSizeMin: 10,
      normalFlushSizeQuotient: 400,
      maxQueueFlushSize: 10,
    },
  },

  governance: {
    proposeConfig: {
      lockDelay: days(90),
      lockAmount: 258_750_000n * 10n ** 18n,
    },
    votingDelay: 12 * 60 * 60, // 12 hours
    votingDuration: days(1),
    executionDelay: 12 * 60 * 60, // 12 hours
    gracePeriod: days(1),
    quorum: 2n * 10n ** 17n, // 0.2e18 = 20%
    requiredYeaMargin: 10n ** 17n, // 0.1e18 = 10%
    minimumVotes: 48n * 200_000n * 10n ** 18n,
  },

  gse: {
    activationThreshold: 200_000n * 10n ** 18n,
    ejectionThreshold: 100_000n * 10n ** 18n,
  },

  governanceProposer: {
    roundSize: 100,
    quorum: 60,
  },

  zkPassport: DEFAULT_ZKPASSPORT_CONFIG,

  logLevel: "info",
  deployArchivalNode: true,
};

export default config;
