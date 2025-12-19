/**
 * Network deployment configuration types.
 * These mirror the Solidity structures in l1-contracts/script/deploy/DeploymentConfiguration.sol
 * and RollupConfiguration.sol.
 */

// ============================================================================
// Time utilities (mirrors Solidity)
// ============================================================================

export const hours = (n: number): number => n * 3600;
export const days = (n: number): number => n * 86400;

// ============================================================================
// Ethereum/L1 Configuration
// ============================================================================

export interface EthereumConfig {
  chainId: number;
  rpcUrls: string[];
  consensusHostUrls: string[];
  consensusHostApiKeys: string[];
  consensusHostApiKeyHeaders: string[];
  blockTime: number;
  gasLimit: number;
}

// ============================================================================
// Deployment Infrastructure Configuration
// ============================================================================

export interface GcpConfig {
  projectId: string;
  region: string;
}

export interface KubernetesConfig {
  cluster: string;
  namespace: string;
  resourceProfile: "dev" | "prod";
}

export interface SecretsConfig {
  labsInfraMnemonic: string;
  rollupDeploymentPrivateKey?: string;
  otelCollectorEndpoint?: string;
  etherscanApiKey?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
}

// ============================================================================
// Validator Configuration
// ============================================================================

export interface ValidatorConfig {
  replicas: number;
  validatorsPerNode: number;
  mnemonicStartIndex: number;
  publisherMnemonicStartIndex: number;
  publishersPerValidatorKey: number;
  resourceProfile?: "dev" | "prod";
}

// ============================================================================
// Prover Configuration
// ============================================================================

export interface ProverConfig {
  replicas: number;
  agentsPerProver: number;
  mnemonicStartIndex: number;
  publishersPerProver: number;
  realProofs: boolean;
  agentPollIntervalMs: number;
  failedProofStore?: string;
  testDelayType?: "fixed" | "random";
  testVerificationDelayMs?: number;
  disableProofPublish?: boolean;
  resourceProfile?: string;
  proofTypes?: string[];
  includeMetrics?: string;
}

// ============================================================================
// Bot Configuration
// ============================================================================

export interface BotConfig {
  transfersReplicas: number;
  transfersMnemonicStartIndex: number;
  transfersTxIntervalSeconds: number;
  transfersFollowChain: "NONE" | "PENDING" | "PROVEN";
  transfersL2PrivateKey: string;
  swapsReplicas: number;
  swapsMnemonicStartIndex: number;
  swapsTxIntervalSeconds: number;
  swapsFollowChain: "NONE" | "PENDING" | "PROVEN";
  swapsL2PrivateKey: string;
  resourceProfile?: "dev" | "prod";
}

// ============================================================================
// RPC/Node Configuration
// ============================================================================

export interface RpcConfig {
  replicas: number;
  ingressEnabled: boolean;
  ingressHost?: string;
  ingressStaticIpName?: string;
  ingressSslCertName?: string;
  resourceProfile?: "dev" | "prod";
}

export interface FullNodeConfig {
  replicas: number;
  resourceProfile?: string;
  includeMetrics?: string;
}

export interface BootnodeConfig {
  deployInternal: boolean;
  resourceProfile?: "dev" | "prod";
}

// ============================================================================
// P2P Configuration
// ============================================================================

export interface P2pConfig {
  maxTxPoolSize: number;
  txPoolDeleteTxsAfterReorg: boolean;
  gossipsubD: number;
  gossipsubDLo: number;
  gossipsubDHi: number;
  dropTx: boolean;
  dropTxChance: number;
  debugInstrumentMessages: boolean;
}

// ============================================================================
// Sequencer Configuration
// ============================================================================

export interface SequencerConfig {
  minTxPerBlock: number;
  maxTxPerBlock: number;
}

// ============================================================================
// Solidity Configuration Structures (matching l1-contracts)
// ============================================================================

/** From DeploymentConfiguration.sol */
export interface ZkPassportConfiguration {
  domain: string;
  scope: string;
}

/** From DeploymentConfiguration.sol */
export interface ProtocolTreasuryConfiguration {
  /** Timestamp until which the treasury is gated */
  gatedUntil: number;
}

/** From DeploymentConfiguration.sol */
export interface CoinIssuerConfiguration {
  /** Rate in wei (0.2e18 = 20%) */
  coinIssuerRate: bigint;
}

/** From DeploymentConfiguration.sol */
export interface GseConfiguration {
  activationThreshold: bigint;
  ejectionThreshold: bigint;
}

/** From DeploymentConfiguration.sol */
export interface GovernanceProposerConfiguration {
  quorum: number;
  roundSize: number;
}

/** From DeploymentConfiguration.sol */
export interface FlushRewardConfiguration {
  rewardPerInsertion: bigint;
  initialFundingAmount: bigint;
}

/** Part of GovernanceConfiguration from DeploymentConfiguration.sol */
export interface ProposeWithLockConfiguration {
  lockDelay: number;
  lockAmount: bigint;
}

/** From DeploymentConfiguration.sol */
export interface GovernanceConfiguration {
  proposeConfig: ProposeWithLockConfiguration;
  votingDelay: number;
  votingDuration: number;
  executionDelay: number;
  gracePeriod: number;
  /** In wei (0.3e18 = 30%) */
  quorum: bigint;
  /** In wei (0.04e18 = 4%) */
  requiredYeaMargin: bigint;
  minimumVotes: bigint;
}

/** From RollupConfiguration.sol */
export interface GenesisState {
  vkTreeRoot: string;
  protocolContractsHash: string;
  genesisArchiveRoot: string;
}

/** From RollupConfiguration.sol */
export interface RewardConfiguration {
  sequencerBps: number;
  checkpointReward: bigint;
}

/** From RollupConfiguration.sol */
export interface RewardBoostConfiguration {
  increment: number;
  maxScore: number;
  a: number;
  minimum: number;
  k: number;
}

/** From RollupConfiguration.sol */
export interface StakingQueueConfiguration {
  bootstrapValidatorSetSize: number;
  bootstrapFlushSize: number;
  normalFlushSizeMin: number;
  normalFlushSizeQuotient: number;
  maxQueueFlushSize: number;
}

/** Slasher flavor enum from RollupConfiguration.sol */
export type SlasherFlavor = "none" | "empire" | "tally";

/** Slash amounts [small, medium, large] */
export interface SlashAmounts {
  small: bigint;
  medium: bigint;
  large: bigint;
}

/** From RollupConfiguration.sol */
export interface RollupConfiguration {
  aztecSlotDuration: number;
  aztecEpochDuration: number;
  targetCommitteeSize: number;
  lagInEpochsForValidatorSet: number;
  lagInEpochsForRandao: number;
  aztecProofSubmissionEpochs: number;
  localEjectionThreshold: bigint;
  slashingQuorum: number;
  slashingRoundSize: number;
  slashingLifetimeInRounds: number;
  slashingExecutionDelayInRounds: number;
  slashAmounts: SlashAmounts;
  slashingOffsetInRounds: number;
  slasherFlavor: SlasherFlavor;
  slashingVetoer?: string;
  slashingDisableDuration: number;
  manaTarget: number;
  exitDelaySeconds: number;
  provingCostPerMana: number;
  reward: RewardConfiguration;
  rewardBoost: RewardBoostConfiguration;
  stakingQueue: StakingQueueConfiguration;
}

// ============================================================================
// Fisherman/Sentinel Configuration
// ============================================================================

export interface FishermanConfig {
  mode: "disabled" | "enabled";
  mnemonicStartIndex: number;
  logLevel?: string;
}

export interface SentinelConfig {
  enabled: boolean;
  minPenaltyPercentage?: number;
  maxPenaltyPercentage?: number;
  inactivityTargetPercentage?: number;
  inactivityPenalty?: bigint;
  prunePenalty?: bigint;
  dataWithholdingPenalty?: bigint;
  proposeInvalidAttestationsPenalty?: bigint;
  attestDescendantOfInvalidPenalty?: bigint;
  unknownPenalty?: bigint;
  invalidBlockPenalty?: bigint;
  offenseExpirationRounds?: number;
  maxPayloadSize?: number;
}

// ============================================================================
// Network Configuration (combines all config groups)
// ============================================================================

export interface NetworkConfig {
  /** Network name (e.g., "devnet", "testnet", "mainnet") */
  name: string;

  /** Ethereum/L1 settings */
  ethereum: EthereumConfig;

  /** GCP settings (for cloud deployments) */
  gcp: GcpConfig;

  /** Kubernetes settings */
  kubernetes: KubernetesConfig;

  /** Secrets configuration */
  secrets: SecretsConfig;

  /** Whether to deploy an ETH devnet (vs using existing L1) */
  deployEthDevnet: boolean;

  /** Whether to deploy rollup contracts */
  deployRollupContracts: boolean;

  /** Whether to deploy Aztec infrastructure */
  deployAztecInfra: boolean;

  /** Whether to use a real verifier */
  realVerifier: boolean;

  /** Whether to deploy test accounts */
  testAccounts: boolean;

  /** Whether to deploy sponsored FPC */
  sponsoredFpc: boolean;

  /** Contract verification settings */
  verifyContracts: boolean;

  /** Validator settings */
  validators: ValidatorConfig;

  /** Prover settings */
  provers: ProverConfig;

  /** Bot settings */
  bots: BotConfig;

  /** RPC settings */
  rpc: RpcConfig;

  /** Full node settings */
  fullNodes: FullNodeConfig;

  /** Bootnode settings */
  bootnode: BootnodeConfig;

  /** P2P settings */
  p2p: P2pConfig;

  /** Sequencer settings */
  sequencer: SequencerConfig;

  /** Fisherman settings */
  fisherman: FishermanConfig;

  /** Sentinel settings */
  sentinel: SentinelConfig;

  /** Rollup configuration (on-chain parameters) */
  rollup: RollupConfiguration;

  /** Governance settings */
  governance: GovernanceConfiguration;

  /** GSE settings */
  gse: GseConfiguration;

  /** Governance proposer settings */
  governanceProposer: GovernanceProposerConfiguration;

  /** ZK Passport settings */
  zkPassport: ZkPassportConfiguration;

  /** Logging level */
  logLevel: string;

  /** Additional flags */
  transactionsDisabled?: boolean;
  storeSnapshotUrl?: string;
  deployArchivalNode?: boolean;
  blobAllowEmptySources?: boolean;
  wsNumHistoricBlocks?: number;
}
