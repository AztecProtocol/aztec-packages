import type { Logger } from '@aztec/foundation/log';

import type { Chain } from 'viem';

import type { Operator } from './deploy_l1_contracts.js';

// ============ Runtime Options (not passed to Solidity) ============

/**
 * Runtime options for Forge deployment functions.
 * These are NOT passed to Solidity scripts.
 */
export interface ForgeRuntimeOptions {
  /** Chain to deploy to (defaults to foundry/anvil) */
  chain?: Chain;
  /** Logger instance */
  logger?: Logger;
}

// ============ JSON Config Sections (match Solidity DeploymentConfig.sol) ============

export interface DeploymentSection {
  networkName?: string; // Network name: local, devnet, next-net, staging-public, testnet, staging-ignition, mainnet
  useMockVerifier?: boolean;
  fundRewardDistributor?: boolean;
  rewardDistributorFunding?: string;
  existingStakingAssetAddress?: string;
  deployFeeAssetHandler?: boolean;
  deployStakingAssetHandler?: boolean;
}

export interface GenesisSection {
  vkTreeRoot?: string;
  protocolContractsHash?: string;
  genesisArchiveRoot?: string;
}

export interface TimingSection {
  aztecSlotDuration?: number;
  aztecEpochDuration?: number;
  targetCommitteeSize?: number;
}

export interface ValidatorSetSection {
  lagInEpochsForValidatorSet?: number;
  lagInEpochsForRandao?: number;
  aztecProofSubmissionEpochs?: number;
}

export interface GseSection {
  activationThreshold?: string;
  ejectionThreshold?: string;
}

export interface SlashingSection {
  flavor?: 'none' | 'empire' | 'tally';
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
}

export interface FeeSection {
  manaTarget?: string;
  exitDelaySeconds?: number;
  provingCostPerMana?: string;
  localEjectionThreshold?: string;
}

export interface GovernanceSection {
  // Proposer configuration
  proposerQuorum?: number;
  proposerRoundSize?: number;
  // Governance voting configuration
  proposeLockDelay?: number;
  proposeLockAmount?: string;
  votingDelay?: number;
  votingDuration?: number;
  executionDelay?: number;
  gracePeriod?: number;
  quorum?: string;
  requiredYeaMargin?: string;
  minimumVotes?: string;
}

export interface RewardSection {
  sequencerBps?: number;
  checkpointReward?: string;
  // Note: earliestRewardsClaimableTimestamp is hardcoded in Solidity to block.timestamp + 90 days
  // It's not configurable via JSON in DeployL1Contracts.s.sol (see line 509)
}

export interface StakingQueueSection {
  bootstrapValidatorSetSize?: number;
  bootstrapFlushSize?: number;
  normalFlushSizeMin?: number;
  normalFlushSizeQuotient?: number;
  maxQueueFlushSize?: number;
}

export interface ZkPassportSection {
  domain?: string;
  scope?: string;
}

// Validator types for initial validator setup
export interface G2PointJson {
  x0: string;
  x1: string;
  y0: string;
  y1: string;
}

/**
 * Validator data passed to Solidity for registration.
 * Solidity will derive publicKeyG1 and proofOfPossession from the privateKey.
 */
export interface ValidatorJson {
  attester: string;
  withdrawer: string;
  /** BN254 secret key (private key) */
  privateKey: string;
  /** Pre-computed G2 public key (cannot be computed in Solidity) */
  publicKeyInG2: G2PointJson;
}

// ============ Script-specific JSON Configs ============

/**
 * JSON config for DeployL1Contracts.s.sol
 * Structure matches DeploymentConfig.sol
 */
export interface L1ContractsJsonConfig {
  deployment?: DeploymentSection;
  genesis?: GenesisSection;
  timing?: TimingSection;
  validatorSet?: ValidatorSetSection;
  gse?: GseSection;
  slashing?: SlashingSection;
  fee?: FeeSection;
  governance?: GovernanceSection;
  reward?: RewardSection;
  stakingQueue?: StakingQueueSection;
  zkPassport?: ZkPassportSection;
  /** Pre-computed initial validators to add during deployment */
  initialValidators?: ValidatorJson[];
}

/**
 * JSON config for DeployStakingAssetHandler.s.sol
 * Flat structure passed directly to Solidity.
 */
export interface StakingAssetHandlerJsonConfig {
  stakingAsset: string;
  registry: string;
  zkPassportDomain?: string;
  zkPassportScope?: string;
}

// ============ Combined Configs with Runtime Options ============

/**
 * Full configuration for setupL1ContractsViaForge().
 * Includes runtime options and nested JSON configs.
 */
export interface L1ContractsDeployConfig extends ForgeRuntimeOptions {
  /** JSON config passed to DeployL1Contracts.s.sol */
  config?: L1ContractsJsonConfig;
  /** Config for StakingAssetHandler deployment (passed to DeployStakingAssetHandler.s.sol) */
  stakingAssetHandler?: Partial<StakingAssetHandlerJsonConfig>;
  /**
   * Initial validators to add during deployment.
   * The registration tuples will be computed from the secret keys before passing to Solidity.
   */
  initialValidators?: Operator[];
}

/**
 * Configuration for deploying StakingAssetHandler standalone.
 */
export interface StakingAssetHandlerDeployConfig extends ForgeRuntimeOptions {
  /** JSON config passed to DeployStakingAssetHandler.s.sol */
  config: StakingAssetHandlerJsonConfig;
}

// ============ JSON Serialization ============

/**
 * Recursively removes undefined values and empty objects from a config.
 * This prevents undefined from becoming null in JSON, which Forge would interpret as address(0).
 */
function filterConfig<T>(obj: T): T | undefined {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const filtered = filterConfig(value);
    if (filtered !== undefined) {
      result[key] = filtered;
    }
  }
  return Object.keys(result).length > 0 ? (result as T) : undefined;
}

/**
 * Stringify config to JSON, filtering out undefined values and empty objects.
 */
export function stringifyConfig(config: object): string {
  return JSON.stringify(filterConfig(config) ?? {});
}

// ============ Legacy Compatibility ============
// TODO: Remove after migrating all callers to new API

/**
 * @deprecated Use L1ContractsDeployConfig instead
 */
export interface ForgeDeploymentConfig extends ForgeRuntimeOptions {
  // Genesis State
  vkTreeRoot?: string;
  protocolContractsHash?: string;
  genesisArchiveRoot?: string;

  // Deployment Options
  realVerifier?: boolean;
  fundRewardDistributor?: boolean;
  rewardDistributorFunding?: bigint;

  // Core Timing
  aztecSlotDuration?: number;
  aztecEpochDuration?: number;
  targetCommitteeSize?: number;

  // Validator Set
  lagInEpochsForValidatorSet?: number;
  lagInEpochsForRandao?: number;
  aztecProofSubmissionEpochs?: number;

  // GSE
  activationThreshold?: bigint;
  ejectionThreshold?: bigint;

  // Slashing
  slasherFlavor?: 'none' | 'empire' | 'tally';
  slashingQuorum?: number;
  slashingRoundSize?: number;
  slashingRoundSizeInEpochs?: number;
  slashingLifetimeInRounds?: number;
  slashingExecutionDelayInRounds?: number;
  slashingOffsetInRounds?: number;
  slashingDisableDuration?: number;
  slashingVetoer?: string;
  slashAmountSmall?: bigint;
  slashAmountMedium?: bigint;
  slashAmountLarge?: bigint;

  // Fee
  manaTarget?: bigint;
  exitDelaySeconds?: number;
  provingCostPerMana?: bigint;
  localEjectionThreshold?: bigint;

  // Governance
  governanceProposerQuorum?: number;
  governanceProposerRoundSize?: number;
  governanceVotingDelay?: number;
  governanceVotingDuration?: number;
  governanceExecutionDelay?: number;
  governanceGracePeriod?: number;

  // Reward
  sequencerBps?: number;
  checkpointReward?: bigint;

  // Staking Queue
  bootstrapValidatorSetSize?: number;
  bootstrapFlushSize?: number;
  normalFlushSizeMin?: number;
  normalFlushSizeQuotient?: number;
  maxQueueFlushSize?: number;

  // ZKPassport (for StakingAssetHandler)
  zkPassportDomain?: string;
  zkPassportScope?: string;
}

/**
 * @deprecated Use L1ContractsJsonConfig instead
 */
export type ForgeDeploymentJsonConfig = L1ContractsJsonConfig;

/**
 * Converts legacy flat config to nested JSON config.
 * @deprecated Use buildL1ContractsJsonConfig instead
 */
export function buildForgeJsonConfig(config: ForgeDeploymentConfig): L1ContractsJsonConfig {
  const bigintToStr = (value: bigint | undefined): string | undefined => {
    return value !== undefined ? value.toString() : undefined;
  };

  const hexToDecimalStr = (hex: string | undefined): string | undefined => {
    if (!hex) {
      return undefined;
    }
    try {
      return BigInt(hex).toString();
    } catch {
      return hex;
    }
  };

  return {
    deployment: {
      useMockVerifier: config.realVerifier !== undefined ? !config.realVerifier : undefined,
      fundRewardDistributor: config.fundRewardDistributor,
      rewardDistributorFunding: bigintToStr(config.rewardDistributorFunding),
    },
    genesis: {
      vkTreeRoot: hexToDecimalStr(config.vkTreeRoot),
      protocolContractsHash: hexToDecimalStr(config.protocolContractsHash),
      genesisArchiveRoot: hexToDecimalStr(config.genesisArchiveRoot),
    },
    timing: {
      aztecSlotDuration: config.aztecSlotDuration,
      aztecEpochDuration: config.aztecEpochDuration,
      targetCommitteeSize: config.targetCommitteeSize,
    },
    validatorSet: {
      lagInEpochsForValidatorSet: config.lagInEpochsForValidatorSet,
      lagInEpochsForRandao: config.lagInEpochsForRandao,
      aztecProofSubmissionEpochs: config.aztecProofSubmissionEpochs,
    },
    gse: {
      activationThreshold: bigintToStr(config.activationThreshold),
      ejectionThreshold: bigintToStr(config.ejectionThreshold),
    },
    slashing: {
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
    },
    fee: {
      manaTarget: bigintToStr(config.manaTarget),
      exitDelaySeconds: config.exitDelaySeconds,
      provingCostPerMana: bigintToStr(config.provingCostPerMana),
      localEjectionThreshold: bigintToStr(config.localEjectionThreshold),
    },
    governance: {
      proposerQuorum: config.governanceProposerQuorum,
      proposerRoundSize: config.governanceProposerRoundSize,
      votingDelay: config.governanceVotingDelay,
      votingDuration: config.governanceVotingDuration,
      executionDelay: config.governanceExecutionDelay,
      gracePeriod: config.governanceGracePeriod,
      // Note: proposeLockDelay, proposeLockAmount, quorum, requiredYeaMargin, minimumVotes
      // are not in legacy config - use new L1ContractsJsonConfig format instead
    },
    reward: {
      sequencerBps: config.sequencerBps,
      checkpointReward: bigintToStr(config.checkpointReward),
    },
    stakingQueue: {
      bootstrapValidatorSetSize: config.bootstrapValidatorSetSize,
      bootstrapFlushSize: config.bootstrapFlushSize,
      normalFlushSizeMin: config.normalFlushSizeMin,
      normalFlushSizeQuotient: config.normalFlushSizeQuotient,
      maxQueueFlushSize: config.maxQueueFlushSize,
    },
  };
}

// Legacy exports for backwards compatibility
export { buildForgeJsonConfig as buildForgeEnvVars };
export function parseForgeDeploymentConfig(_json: Record<string, unknown>): ForgeDeploymentConfig {
  throw new Error('parseForgeDeploymentConfig is deprecated - use nested config types directly');
}
export const DEFAULT_FORGE_DEPLOYMENT_CONFIG = {};
