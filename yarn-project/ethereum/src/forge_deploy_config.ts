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
 * Includes runtime options and JSON config passed to Solidity.
 * All values are JSON-serializable (strings for bigints/addresses).
 */
export interface L1ContractsDeployConfig extends ForgeRuntimeOptions {
  /** Config for StakingAssetHandler deployment (passed to DeployStakingAssetHandler.s.sol) */
  stakingAssetHandler?: Partial<StakingAssetHandlerJsonConfig>;
  /**
   * Initial validators to add during deployment.
   * The registration tuples will be computed from the secret keys before passing to Solidity.
   */
  initialValidators?: Operator[];

  // ============ JSON config passed to DeployL1Contracts.s.sol ============
  // Uses flat keys matching L1ContractsConfig field names.

  // Deployment options
  networkName?: string;
  realVerifier?: boolean;
  fundRewardDistributor?: boolean;
  rewardDistributorFunding?: string;
  existingStakingAssetAddress?: string;

  // Genesis config
  vkTreeRoot?: string;
  protocolContractsHash?: string;
  genesisArchiveRoot?: string;

  // Timing config (matching L1ContractsConfig field names)
  ethereumSlotDuration?: number;
  aztecSlotDuration?: number;
  aztecEpochDuration?: number;
  aztecTargetCommitteeSize?: number;

  // Validator set config
  lagInEpochsForValidatorSet?: number;
  lagInEpochsForRandao?: number;
  aztecProofSubmissionEpochs?: number;

  // GSE config
  activationThreshold?: string;
  ejectionThreshold?: string;
  localEjectionThreshold?: string;

  // Slashing config
  slasherFlavor?: 'none' | 'tally' | 'empire';
  slashingQuorum?: number;
  slashingRoundSizeInEpochs?: number;
  slashingOffsetInRounds?: number;
  slashingLifetimeInRounds?: number;
  slashingExecutionDelayInRounds?: number;
  slashingDisableDuration?: number;
  slashingVetoer?: string;
  slashAmountSmall?: string;
  slashAmountMedium?: string;
  slashAmountLarge?: string;

  // Fee config
  manaTarget?: string;
  provingCostPerMana?: string;
  exitDelaySeconds?: number;

  // Governance config
  governanceProposerQuorum?: number;
  governanceProposerRoundSize?: number;

  // ZK Passport config
  zkPassportDomain?: string;
  zkPassportScope?: string;
}

/** @deprecated Use L1ContractsDeployConfig directly */
export type L1ContractsJsonConfig = Omit<
  L1ContractsDeployConfig,
  keyof ForgeRuntimeOptions | 'stakingAssetHandler' | 'initialValidators'
>;

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
 */
function filterUndefined<T>(obj: T): T | undefined {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const filtered = filterUndefined(value);
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
  return JSON.stringify(filterUndefined(config) ?? {});
}
