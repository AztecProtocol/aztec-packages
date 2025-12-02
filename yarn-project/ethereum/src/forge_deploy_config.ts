import type { Logger } from '@aztec/foundation/log';

import type { Chain } from 'viem';

/**
 * Comprehensive configuration for Forge-based L1 contract deployment.
 * All parameters map to environment variables in the Solidity E2EConfiguration contract.
 * Defaults match E2EConfiguration.sol defaults where applicable.
 */
export interface ForgeDeploymentConfig {
  // ============ Runtime Options ============
  /** Chain to deploy to (defaults to foundry/anvil) */
  chain?: Chain;
  /** Logger instance */
  logger?: Logger;

  // ============ Genesis State ============
  /** VK tree root (hex string) */
  vkTreeRoot?: string;
  /** Protocol contracts hash (hex string) */
  protocolContractsHash?: string;
  /** Genesis archive root (hex string) */
  genesisArchiveRoot?: string;

  // ============ Deployment Options ============
  /** Use real verifier (HonkVerifier) instead of MockVerifier (default: false) */
  realVerifier?: boolean;
  /** Fund the reward distributor with tokens (default: true) */
  fundRewardDistributor?: boolean;
  /** Amount to fund the reward distributor (default: 50_000_000e18) */
  rewardDistributorFunding?: bigint;

  // ============ Core Timing ============
  /** L2 slot duration in seconds (default: 36) */
  aztecSlotDuration?: number;
  /** L2 epoch duration in slots (default: 32) */
  aztecEpochDuration?: number;
  /** Target committee size (default: 48) */
  targetCommitteeSize?: number;

  // ============ Validator Set Config ============
  /** Lag in epochs for validator set (default: 3) */
  lagInEpochsForValidatorSet?: number;
  /** Lag in epochs for randao (default: 2) */
  lagInEpochsForRandao?: number;
  /** Aztec proof submission epochs (default: 2) */
  aztecProofSubmissionEpochs?: number;

  // ============ GSE Configuration ============
  /** GSE activation threshold in wei (default: 100_000e18) */
  activationThreshold?: bigint;
  /** GSE ejection threshold in wei (default: 50_000e18) */
  ejectionThreshold?: bigint;

  // ============ Slashing Configuration ============
  /** Slasher flavor: 'none' | 'empire' | 'tally' (default: 'none') */
  slasherFlavor?: 'none' | 'empire' | 'tally';
  /** Slashing quorum (default: calculated from slashingRoundSize) */
  slashingQuorum?: number;
  /** Slashing round size in slots (default: calculated from slashingRoundSizeInEpochs * aztecEpochDuration) */
  slashingRoundSize?: number;
  /** Slashing round size in epochs (used for calculation, default: 4) */
  slashingRoundSizeInEpochs?: number;
  /** Slashing lifetime in rounds (default: 5) */
  slashingLifetimeInRounds?: number;
  /** Slashing execution delay in rounds (default: 0) */
  slashingExecutionDelayInRounds?: number;
  /** Slashing offset in rounds (default: 2 for tally, 0 for others) */
  slashingOffsetInRounds?: number;
  /** Slashing disable duration in seconds (default: 5 days) */
  slashingDisableDuration?: number;
  /** Slashing vetoer address (default: zero address) */
  slashingVetoer?: string;
  /** Small slash amount (default: 10_000e18) */
  slashAmountSmall?: bigint;
  /** Medium slash amount (default: 20_000e18) */
  slashAmountMedium?: bigint;
  /** Large slash amount (default: 50_000e18) */
  slashAmountLarge?: bigint;

  // ============ Fee Configuration ============
  /** Mana target (default: 100_000_000) */
  manaTarget?: bigint;
  /** Exit delay in seconds (default: 4 days) */
  exitDelaySeconds?: number;
  /** Proving cost per mana (default: 0) */
  provingCostPerMana?: bigint;
  /** Local ejection threshold (default: 96_000e18) */
  localEjectionThreshold?: bigint;

  // ============ Governance Configuration ============
  /** Governance proposer quorum (default: 6) */
  governanceProposerQuorum?: number;
  /** Governance proposer round size (default: 10) */
  governanceProposerRoundSize?: number;
  /** Governance voting delay (default: 1 day) */
  governanceVotingDelay?: number;
  /** Governance voting duration (default: 7 days) */
  governanceVotingDuration?: number;
  /** Governance execution delay (default: 1 day) */
  governanceExecutionDelay?: number;
  /** Governance grace period (default: 7 days) */
  governanceGracePeriod?: number;

  // ============ Reward Configuration ============
  /** Sequencer BPS (default: 5000) */
  sequencerBps?: number;
  /** Checkpoint reward (default: 50e18) */
  checkpointReward?: bigint;

  // ============ Staking Queue Configuration ============
  /** Bootstrap validator set size (default: 48) */
  bootstrapValidatorSetSize?: number;
  /** Bootstrap flush size (default: 8) */
  bootstrapFlushSize?: number;
  /** Normal flush size min (default: 1) */
  normalFlushSizeMin?: number;
  /** Normal flush size quotient (default: 2048) */
  normalFlushSizeQuotient?: number;
  /** Max queue flush size (default: 8) */
  maxQueueFlushSize?: number;
}

/**
 * Default values matching E2EConfiguration.sol
 */
export const DEFAULT_FORGE_DEPLOYMENT_CONFIG: Required<
  Omit<ForgeDeploymentConfig, 'chain' | 'logger' | 'vkTreeRoot' | 'protocolContractsHash' | 'genesisArchiveRoot'>
> = {
  // Deployment options
  realVerifier: false,
  fundRewardDistributor: true,
  rewardDistributorFunding: 50_000_000n * 10n ** 18n,

  // Core timing
  aztecSlotDuration: 36,
  aztecEpochDuration: 32,
  targetCommitteeSize: 48,

  // Validator set
  lagInEpochsForValidatorSet: 3,
  lagInEpochsForRandao: 2,
  aztecProofSubmissionEpochs: 2,

  // GSE
  activationThreshold: 100_000n * 10n ** 18n,
  ejectionThreshold: 50_000n * 10n ** 18n,

  // Slashing - note: defaults are designed to work together
  slasherFlavor: 'tally',
  slashingRoundSizeInEpochs: 4, // 4 epochs per round
  slashingRoundSize: 128, // 4 * 32 = 128 slots
  slashingQuorum: 65, // 128/2 + 1 = 65
  slashingLifetimeInRounds: 5,
  slashingExecutionDelayInRounds: 0,
  slashingOffsetInRounds: 2, // Required > 0 for tally
  slashingDisableDuration: 5 * 24 * 60 * 60, // 5 days
  slashingVetoer: '0x0000000000000000000000000000000000000000',
  slashAmountSmall: 10_000n * 10n ** 18n,
  slashAmountMedium: 20_000n * 10n ** 18n,
  slashAmountLarge: 50_000n * 10n ** 18n,

  // Fee
  manaTarget: 100_000_000n,
  exitDelaySeconds: 4 * 24 * 60 * 60, // 4 days
  provingCostPerMana: 0n,
  localEjectionThreshold: 96_000n * 10n ** 18n,

  // Governance
  governanceProposerQuorum: 6,
  governanceProposerRoundSize: 10,
  governanceVotingDelay: 1 * 24 * 60 * 60, // 1 day
  governanceVotingDuration: 7 * 24 * 60 * 60, // 7 days
  governanceExecutionDelay: 1 * 24 * 60 * 60, // 1 day
  governanceGracePeriod: 7 * 24 * 60 * 60, // 7 days

  // Reward
  sequencerBps: 5000,
  checkpointReward: 50n * 10n ** 18n,

  // Staking queue
  bootstrapValidatorSetSize: 48,
  bootstrapFlushSize: 8,
  normalFlushSizeMin: 1,
  normalFlushSizeQuotient: 2048,
  maxQueueFlushSize: 8,
};

/**
 * Converts slasher flavor string to numeric value for forge env.
 */
function slasherFlavorToEnvValue(flavor: 'none' | 'empire' | 'tally'): string {
  switch (flavor) {
    case 'empire':
      return '1';
    case 'tally':
      return '2';
    case 'none':
    default:
      return '0';
  }
}

/**
 * Builds environment variables from a ForgeDeploymentConfig.
 * Only passes through explicitly set values - the Solidity E2EConfiguration handles defaults
 * and dependent value calculations (e.g., slashingQuorum from slashingRoundSize).
 */
export function buildForgeEnvVars(config: ForgeDeploymentConfig): Record<string, string> {
  const env: Record<string, string> = {};

  // Helper to set env var only if value is defined
  const setIfDefined = (key: string, value: unknown, transform?: (v: unknown) => string) => {
    if (value !== undefined && value !== null) {
      env[key] = transform ? transform(value) : String(value);
    }
  };

  // ============ Deployment options ============
  // FAKE_PROOFS: 1=MockVerifier (default), 0=HonkVerifier
  env.FAKE_PROOFS = config.realVerifier ? '0' : '1';
  if (config.fundRewardDistributor !== undefined) {
    env.FUND_REWARD_DISTRIBUTOR = config.fundRewardDistributor ? '1' : '0';
  }
  setIfDefined('REWARD_DISTRIBUTOR_FUNDING', config.rewardDistributorFunding);

  // ============ Genesis state ============
  setIfDefined('VK_TREE_ROOT', config.vkTreeRoot);
  setIfDefined('PROTOCOL_CONTRACTS_HASH', config.protocolContractsHash);
  setIfDefined('GENESIS_ARCHIVE_ROOT', config.genesisArchiveRoot);

  // ============ Core timing ============
  setIfDefined('AZTEC_SLOT_DURATION', config.aztecSlotDuration);
  setIfDefined('AZTEC_EPOCH_DURATION', config.aztecEpochDuration);
  setIfDefined('TARGET_COMMITTEE_SIZE', config.targetCommitteeSize);

  // ============ Validator set ============
  setIfDefined('LAG_IN_EPOCHS_FOR_VALIDATOR_SET', config.lagInEpochsForValidatorSet);
  setIfDefined('LAG_IN_EPOCHS_FOR_RANDAO', config.lagInEpochsForRandao);
  setIfDefined('AZTEC_PROOF_SUBMISSION_EPOCHS', config.aztecProofSubmissionEpochs);

  // ============ GSE ============
  setIfDefined('ACTIVATION_THRESHOLD', config.activationThreshold);
  setIfDefined('EJECTION_THRESHOLD', config.ejectionThreshold);

  // ============ Slashing ============
  // Solidity handles dependent calculations:
  // - slashingRoundSize = slashingRoundSizeInEpochs * aztecEpochDuration
  // - slashingQuorum = slashingRoundSize / 2 + 1
  // - slashingOffsetInRounds = 2 for TALLY, 0 for others
  if (config.slasherFlavor !== undefined) {
    env.SLASHER_FLAVOR = slasherFlavorToEnvValue(config.slasherFlavor);
  }
  setIfDefined('SLASHING_ROUND_SIZE_IN_EPOCHS', config.slashingRoundSizeInEpochs);
  setIfDefined('SLASHING_ROUND_SIZE', config.slashingRoundSize);
  setIfDefined('SLASHING_QUORUM', config.slashingQuorum);
  setIfDefined('SLASHING_OFFSET_IN_ROUNDS', config.slashingOffsetInRounds);
  setIfDefined('SLASHING_LIFETIME_IN_ROUNDS', config.slashingLifetimeInRounds);
  setIfDefined('SLASHING_EXECUTION_DELAY_IN_ROUNDS', config.slashingExecutionDelayInRounds);
  setIfDefined('SLASHING_DISABLE_DURATION', config.slashingDisableDuration);
  setIfDefined('SLASHING_VETOER', config.slashingVetoer);
  setIfDefined('SLASH_AMOUNT_SMALL', config.slashAmountSmall);
  setIfDefined('SLASH_AMOUNT_MEDIUM', config.slashAmountMedium);
  setIfDefined('SLASH_AMOUNT_LARGE', config.slashAmountLarge);

  // ============ Fee ============
  setIfDefined('MANA_TARGET', config.manaTarget);
  setIfDefined('EXIT_DELAY_SECONDS', config.exitDelaySeconds);
  setIfDefined('PROVING_COST_PER_MANA', config.provingCostPerMana);
  setIfDefined('LOCAL_EJECTION_THRESHOLD', config.localEjectionThreshold);

  // ============ Governance ============
  setIfDefined('GOVERNANCE_PROPOSER_QUORUM', config.governanceProposerQuorum);
  setIfDefined('GOVERNANCE_PROPOSER_ROUND_SIZE', config.governanceProposerRoundSize);
  setIfDefined('GOVERNANCE_VOTING_DELAY', config.governanceVotingDelay);
  setIfDefined('GOVERNANCE_VOTING_DURATION', config.governanceVotingDuration);
  setIfDefined('GOVERNANCE_EXECUTION_DELAY', config.governanceExecutionDelay);
  setIfDefined('GOVERNANCE_GRACE_PERIOD', config.governanceGracePeriod);

  // ============ Reward ============
  setIfDefined('SEQUENCER_BPS', config.sequencerBps);
  setIfDefined('CHECKPOINT_REWARD', config.checkpointReward);

  // ============ Staking queue ============
  setIfDefined('BOOTSTRAP_VALIDATOR_SET_SIZE', config.bootstrapValidatorSetSize);
  setIfDefined('BOOTSTRAP_FLUSH_SIZE', config.bootstrapFlushSize);
  setIfDefined('NORMAL_FLUSH_SIZE_MIN', config.normalFlushSizeMin);
  setIfDefined('NORMAL_FLUSH_SIZE_QUOTIENT', config.normalFlushSizeQuotient);
  setIfDefined('MAX_QUEUE_FLUSH_SIZE', config.maxQueueFlushSize);

  return env;
}

/**
 * Loads a ForgeDeploymentConfig from a JSON object, parsing bigint strings.
 */
export function parseForgeDeploymentConfig(json: Record<string, unknown>): ForgeDeploymentConfig {
  const config: ForgeDeploymentConfig = {};

  // Helper to parse bigint from string or number
  const toBigInt = (value: unknown): bigint | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string') return BigInt(value);
    return undefined;
  };

  // Helper to parse number
  const toNumber = (value: unknown): number | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseInt(value, 10);
    return undefined;
  };

  // Helper to parse string
  const toString = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    return String(value);
  };

  // Helper to parse boolean
  const toBool = (value: unknown): boolean | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
    if (typeof value === 'number') return value !== 0;
    return undefined;
  };

  // Parse all fields
  config.vkTreeRoot = toString(json.vkTreeRoot);
  config.protocolContractsHash = toString(json.protocolContractsHash);
  config.genesisArchiveRoot = toString(json.genesisArchiveRoot);

  config.realVerifier = toBool(json.realVerifier);
  config.fundRewardDistributor = toBool(json.fundRewardDistributor);
  config.rewardDistributorFunding = toBigInt(json.rewardDistributorFunding);

  config.aztecSlotDuration = toNumber(json.aztecSlotDuration);
  config.aztecEpochDuration = toNumber(json.aztecEpochDuration);
  config.targetCommitteeSize = toNumber(json.targetCommitteeSize);

  config.lagInEpochsForValidatorSet = toNumber(json.lagInEpochsForValidatorSet);
  config.lagInEpochsForRandao = toNumber(json.lagInEpochsForRandao);
  config.aztecProofSubmissionEpochs = toNumber(json.aztecProofSubmissionEpochs);

  config.activationThreshold = toBigInt(json.activationThreshold);
  config.ejectionThreshold = toBigInt(json.ejectionThreshold);

  const flavor = toString(json.slasherFlavor);
  if (flavor === 'none' || flavor === 'empire' || flavor === 'tally') {
    config.slasherFlavor = flavor;
  }
  config.slashingQuorum = toNumber(json.slashingQuorum);
  config.slashingRoundSize = toNumber(json.slashingRoundSize);
  config.slashingRoundSizeInEpochs = toNumber(json.slashingRoundSizeInEpochs);
  config.slashingLifetimeInRounds = toNumber(json.slashingLifetimeInRounds);
  config.slashingExecutionDelayInRounds = toNumber(json.slashingExecutionDelayInRounds);
  config.slashingOffsetInRounds = toNumber(json.slashingOffsetInRounds);
  config.slashingDisableDuration = toNumber(json.slashingDisableDuration);
  config.slashingVetoer = toString(json.slashingVetoer);
  config.slashAmountSmall = toBigInt(json.slashAmountSmall);
  config.slashAmountMedium = toBigInt(json.slashAmountMedium);
  config.slashAmountLarge = toBigInt(json.slashAmountLarge);

  config.manaTarget = toBigInt(json.manaTarget);
  config.exitDelaySeconds = toNumber(json.exitDelaySeconds);
  config.provingCostPerMana = toBigInt(json.provingCostPerMana);
  config.localEjectionThreshold = toBigInt(json.localEjectionThreshold);

  config.governanceProposerQuorum = toNumber(json.governanceProposerQuorum);
  config.governanceProposerRoundSize = toNumber(json.governanceProposerRoundSize);
  config.governanceVotingDelay = toNumber(json.governanceVotingDelay);
  config.governanceVotingDuration = toNumber(json.governanceVotingDuration);
  config.governanceExecutionDelay = toNumber(json.governanceExecutionDelay);
  config.governanceGracePeriod = toNumber(json.governanceGracePeriod);

  config.sequencerBps = toNumber(json.sequencerBps);
  config.checkpointReward = toBigInt(json.checkpointReward);

  config.bootstrapValidatorSetSize = toNumber(json.bootstrapValidatorSetSize);
  config.bootstrapFlushSize = toNumber(json.bootstrapFlushSize);
  config.normalFlushSizeMin = toNumber(json.normalFlushSizeMin);
  config.normalFlushSizeQuotient = toNumber(json.normalFlushSizeQuotient);
  config.maxQueueFlushSize = toNumber(json.maxQueueFlushSize);

  return config;
}

/**
 * JSON config structure matching DeploymentConfig.sol expected format.
 * All numeric values are stored as strings for bigint compatibility.
 */
export interface ForgeDeploymentJsonConfig {
  deployment?: {
    useMockVerifier?: boolean;
    fundRewardDistributor?: boolean;
    rewardDistributorFunding?: string;
  };
  genesis?: {
    vkTreeRoot?: string;
    protocolContractsHash?: string;
    genesisArchiveRoot?: string;
  };
  timing?: {
    aztecSlotDuration?: number;
    aztecEpochDuration?: number;
    targetCommitteeSize?: number;
  };
  validatorSet?: {
    lagInEpochsForValidatorSet?: number;
    lagInEpochsForRandao?: number;
    aztecProofSubmissionEpochs?: number;
  };
  gse?: {
    activationThreshold?: string;
    ejectionThreshold?: string;
  };
  slashing?: {
    flavor?: string;
    roundSizeInEpochs?: number;
    roundSize?: number;
    quorum?: number;
    lifetimeInRounds?: number;
    executionDelayInRounds?: number;
    offsetInRounds?: number;
    disableDuration?: number;
    vetoer?: string;
    amountSmall?: string;
    amountMedium?: string;
    amountLarge?: string;
  };
  fee?: {
    manaTarget?: string;
    exitDelaySeconds?: number;
    provingCostPerMana?: string;
    localEjectionThreshold?: string;
  };
  governance?: {
    proposerQuorum?: number;
    proposerRoundSize?: number;
    votingDelay?: number;
    votingDuration?: number;
    executionDelay?: number;
    gracePeriod?: number;
  };
  reward?: {
    sequencerBps?: number;
    checkpointReward?: string;
  };
  stakingQueue?: {
    bootstrapValidatorSetSize?: number;
    bootstrapFlushSize?: number;
    normalFlushSizeMin?: number;
    normalFlushSizeQuotient?: number;
    maxQueueFlushSize?: number;
  };
}

/**
 * Builds a structured JSON config object from ForgeDeploymentConfig.
 * This format matches what DeploymentConfig.sol expects to read.
 */
export function buildForgeJsonConfig(config: ForgeDeploymentConfig): ForgeDeploymentJsonConfig {
  const json: ForgeDeploymentJsonConfig = {};

  // Helper to convert bigint to string for JSON
  const bigintToStr = (value: bigint | undefined): string | undefined => {
    return value !== undefined ? value.toString() : undefined;
  };

  // Helper to only include defined values
  const filterUndefined = <T extends object>(obj: T): T | undefined => {
    const filtered = Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  };

  // Deployment section
  json.deployment = filterUndefined({
    useMockVerifier: config.realVerifier !== undefined ? !config.realVerifier : undefined,
    fundRewardDistributor: config.fundRewardDistributor,
    rewardDistributorFunding: bigintToStr(config.rewardDistributorFunding),
  });

  // Genesis section (convert hex numbers to decimal strings for Solidity uint parsing)
  const hexToDecimalStr = (hex: string | undefined): string | undefined => {
    if (!hex) return undefined;
    try {
      return BigInt(hex).toString();
    } catch {
      return hex;
    }
  };

  json.genesis = filterUndefined({
    vkTreeRoot: hexToDecimalStr(config.vkTreeRoot),
    protocolContractsHash: hexToDecimalStr(config.protocolContractsHash),
    genesisArchiveRoot: hexToDecimalStr(config.genesisArchiveRoot),
  });

  // Timing section
  json.timing = filterUndefined({
    aztecSlotDuration: config.aztecSlotDuration,
    aztecEpochDuration: config.aztecEpochDuration,
    targetCommitteeSize: config.targetCommitteeSize,
  });

  // Validator set section
  json.validatorSet = filterUndefined({
    lagInEpochsForValidatorSet: config.lagInEpochsForValidatorSet,
    lagInEpochsForRandao: config.lagInEpochsForRandao,
    aztecProofSubmissionEpochs: config.aztecProofSubmissionEpochs,
  });

  // GSE section
  json.gse = filterUndefined({
    activationThreshold: bigintToStr(config.activationThreshold),
    ejectionThreshold: bigintToStr(config.ejectionThreshold),
  });

  // Slashing section
  json.slashing = filterUndefined({
    flavor: config.slasherFlavor,
    roundSizeInEpochs: config.slashingRoundSizeInEpochs,
    roundSize: config.slashingRoundSize,
    quorum: config.slashingQuorum,
    lifetimeInRounds: config.slashingLifetimeInRounds,
    executionDelayInRounds: config.slashingExecutionDelayInRounds,
    offsetInRounds: config.slashingOffsetInRounds,
    disableDuration: config.slashingDisableDuration,
    vetoer: config.slashingVetoer,
    amountSmall: bigintToStr(config.slashAmountSmall),
    amountMedium: bigintToStr(config.slashAmountMedium),
    amountLarge: bigintToStr(config.slashAmountLarge),
  });

  // Fee section
  json.fee = filterUndefined({
    manaTarget: bigintToStr(config.manaTarget),
    exitDelaySeconds: config.exitDelaySeconds,
    provingCostPerMana: bigintToStr(config.provingCostPerMana),
    localEjectionThreshold: bigintToStr(config.localEjectionThreshold),
  });

  // Governance section
  json.governance = filterUndefined({
    proposerQuorum: config.governanceProposerQuorum,
    proposerRoundSize: config.governanceProposerRoundSize,
    votingDelay: config.governanceVotingDelay,
    votingDuration: config.governanceVotingDuration,
    executionDelay: config.governanceExecutionDelay,
    gracePeriod: config.governanceGracePeriod,
  });

  // Reward section
  json.reward = filterUndefined({
    sequencerBps: config.sequencerBps,
    checkpointReward: bigintToStr(config.checkpointReward),
  });

  // Staking queue section
  json.stakingQueue = filterUndefined({
    bootstrapValidatorSetSize: config.bootstrapValidatorSetSize,
    bootstrapFlushSize: config.bootstrapFlushSize,
    normalFlushSizeMin: config.normalFlushSizeMin,
    normalFlushSizeQuotient: config.normalFlushSizeQuotient,
    maxQueueFlushSize: config.maxQueueFlushSize,
  });

  // Filter out empty sections
  return Object.fromEntries(Object.entries(json).filter(([, v]) => v !== undefined)) as ForgeDeploymentJsonConfig;
}
