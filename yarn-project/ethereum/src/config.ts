import {
  type ConfigMappingsType,
  type NetworkNames,
  bigintConfigHelper,
  booleanConfigHelper,
  enumConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

import { type L1TxUtilsConfig, l1TxUtilsConfigMappings } from './l1_tx_utils/index.js';

export type GenesisStateConfig = {
  /** Whether to populate the genesis state with initial fee juice for the test accounts */
  testAccounts: boolean;
  /** Whether to populate the genesis state with initial fee juice for the sponsored FPC */
  sponsoredFPC: boolean;
};

export type L1ContractsConfig = {
  /** How many seconds an L1 slot lasts. */
  ethereumSlotDuration: number;
  /** How many seconds an L2 slots lasts (must be multiple of ethereum slot duration). */
  aztecSlotDuration: number;
  /** How many L2 slots an epoch lasts. */
  aztecEpochDuration: number;
  /** The target validator committee size. */
  aztecTargetCommitteeSize: number;
  /** The number of epochs to lag behind the current epoch for validator selection. */
  lagInEpochs: number;
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: number;
  /** The deposit amount for a validator */
  activationThreshold: bigint;
  /** The minimum stake for a validator. */
  ejectionThreshold: bigint;
  /** The local ejection threshold for a validator. Stricter than ejectionThreshold but local to a specific rollup */
  localEjectionThreshold: bigint;
  /** The slashing quorum, i.e. how many slots must signal for the same payload in a round for it to be submittable to the Slasher (defaults to slashRoundSize / 2 + 1) */
  slashingQuorum?: number;
  /** The slashing round size, i.e. how many epochs are in a slashing round */
  slashingRoundSizeInEpochs: number;
  /** The slashing lifetime in rounds. I.e., if 1, round N must be submitted before round N + 2 */
  slashingLifetimeInRounds: number;
  /** The slashing execution delay in rounds. I.e., if 1, round N may not be submitted until round N + 2 */
  slashingExecutionDelayInRounds: number;
  /** The slashing vetoer. May blacklist a payload from being submitted. */
  slashingVetoer: EthAddress;
  /** How many slashing rounds back we slash (ie when slashing in round N, we slash for offenses committed during epochs of round N-offset) */
  slashingOffsetInRounds: number;
  /** How long slashing can be disabled for in seconds when vetoer disables it */
  slashingDisableDuration: number;
  /** Type of slasher proposer */
  slasherFlavor: 'empire' | 'tally' | 'none';
  /** Minimum amount that can be slashed in tally slashing */
  slashAmountSmall: bigint;
  /** Medium amount to slash in tally slashing */
  slashAmountMedium: bigint;
  /** Largest amount that can be slashed per round in tally slashing */
  slashAmountLarge: bigint;
  /** Governance proposing quorum (defaults to roundSize/2 + 1) */
  governanceProposerQuorum?: number;
  /** Governance proposing round size */
  governanceProposerRoundSize: number;
  /** The mana target for the rollup */
  manaTarget: bigint;
  /** The proving cost per mana */
  provingCostPerMana: bigint;
  /** The number of seconds to wait for an exit */
  exitDelaySeconds: number;
} & L1TxUtilsConfig;

export const DefaultL1ContractsConfig = {
  ethereumSlotDuration: 12,
  aztecSlotDuration: 36,
  aztecEpochDuration: 32,
  aztecTargetCommitteeSize: 48,
  lagInEpochs: 2,
  aztecProofSubmissionEpochs: 1, // you have a full epoch to submit a proof after the epoch to prove ends
  activationThreshold: 100n * 10n ** 18n,
  ejectionThreshold: 50n * 10n ** 18n,
  localEjectionThreshold: 98n * 10n ** 18n,
  slashAmountSmall: 10n * 10n ** 18n,
  slashAmountMedium: 20n * 10n ** 18n,
  slashAmountLarge: 50n * 10n ** 18n,
  slashingRoundSizeInEpochs: 4,
  slashingLifetimeInRounds: 5,
  slashingExecutionDelayInRounds: 0, // round N may be submitted in round N + 1
  slashingVetoer: EthAddress.ZERO,
  governanceProposerRoundSize: 300,
  manaTarget: BigInt(1e10),
  provingCostPerMana: BigInt(100),
  exitDelaySeconds: 2 * 24 * 60 * 60,
  slasherFlavor: 'tally' as const,
  slashingOffsetInRounds: 2,
  slashingDisableDuration: 5 * 24 * 60 * 60, // 5 days in seconds
} satisfies L1ContractsConfig;

const LocalGovernanceConfiguration = {
  proposeConfig: {
    lockDelay: 60n * 60n * 24n * 30n,
    lockAmount: 1n * 10n ** 24n,
  },
  votingDelay: 60n,
  votingDuration: 60n * 60n,
  executionDelay: 60n,
  gracePeriod: 60n * 60n * 24n * 7n,
  quorum: 1n * 10n ** 17n, // 10%
  requiredYeaMargin: 4n * 10n ** 16n, // 4%
  minimumVotes: 400n * 10n ** 18n,
};

const StagingPublicGovernanceConfiguration = {
  proposeConfig: {
    lockDelay: 60n * 60n * 24n * 30n,
    lockAmount: DefaultL1ContractsConfig.activationThreshold * 100n,
  },
  votingDelay: 60n,
  votingDuration: 60n * 60n,
  executionDelay: 60n,
  gracePeriod: 60n * 60n * 24n * 7n,
  quorum: 3n * 10n ** 17n, // 30%
  requiredYeaMargin: 4n * 10n ** 16n, // 4%
  minimumVotes: DefaultL1ContractsConfig.ejectionThreshold * 200n, // >= 200 validators must vote
};

const TestnetGovernanceConfiguration = {
  proposeConfig: {
    lockDelay: 10n * 365n * 24n * 60n * 60n,
    lockAmount: 1250n * 200_000n * 10n ** 18n,
  },

  votingDelay: 12n * 60n * 60n, // 12 hours
  votingDuration: 1n * 24n * 60n * 60n, // 1 day
  executionDelay: 12n * 60n * 60n, // 12 hours
  gracePeriod: 1n * 24n * 60n * 60n, // 1 day
  quorum: 2n * 10n ** 17n, // 20%
  requiredYeaMargin: 1n * 10n ** 17n, // 10%
  minimumVotes: 1250n * 200_000n * 10n ** 18n,
};

const StagingIgnitionGovernanceConfiguration = {
  proposeConfig: {
    lockDelay: 10n * 365n * 24n * 60n * 60n,
    lockAmount: 1250n * 200_000n * 10n ** 18n,
  },

  votingDelay: 7n * 24n * 60n * 60n,
  votingDuration: 7n * 24n * 60n * 60n,
  executionDelay: 30n * 24n * 60n * 60n,
  gracePeriod: 7n * 24n * 60n * 60n,
  quorum: 2n * 10n ** 17n, // 20%
  requiredYeaMargin: 1n * 10n ** 17n, // 10%
  minimumVotes: 1250n * 200_000n * 10n ** 18n,
};

export const getGovernanceConfiguration = (networkName: NetworkNames) => {
  switch (networkName) {
    case 'local':
      return LocalGovernanceConfiguration;
    case 'next-net':
      return LocalGovernanceConfiguration;
    case 'staging-public':
      return StagingPublicGovernanceConfiguration;
    case 'testnet':
      return TestnetGovernanceConfiguration;
    case 'staging-ignition':
      return StagingIgnitionGovernanceConfiguration;
    default:
      throw new Error(`Unrecognized network name: ${networkName}`);
  }
};

// Making a default config here as we are only using it thought the deployment
// and do not expect to be using different setups, so having environment variables
// for it seems overkill

const DefaultRewardConfig = {
  sequencerBps: 8000,
  rewardDistributor: EthAddress.ZERO.toString(),
  booster: EthAddress.ZERO.toString(),
  blockReward: 500n * 10n ** 18n,
};

export const getRewardConfig = (networkName: NetworkNames) => {
  switch (networkName) {
    case 'local':
    case 'next-net':
    case 'staging-public':
    case 'testnet':
    case 'staging-ignition':
      return DefaultRewardConfig;
    default:
      throw new Error(`Unrecognized network name: ${networkName}`);
  }
};

export const getRewardBoostConfig = () => {
  // The reward configuration is specified with a precision of 1e5, and we use the same across
  // all networks.
  return {
    increment: 125000, // 1.25
    maxScore: 15000000, // 150
    a: 1000, // 0.01
    k: 1000000, // 10
    minimum: 100000, // 1
  };
};

// Similar to the above, no need for environment variables for this.
const LocalEntryQueueConfig = {
  bootstrapValidatorSetSize: 0n,
  bootstrapFlushSize: 0n,
  normalFlushSizeMin: 48n,
  normalFlushSizeQuotient: 2n,
  maxQueueFlushSize: 48n,
};

const StagingPublicEntryQueueConfig = {
  bootstrapValidatorSetSize: 48n,
  bootstrapFlushSize: 48n,
  normalFlushSizeMin: 1n,
  normalFlushSizeQuotient: 2475n,
  maxQueueFlushSize: 32n, // Limited to 32 so flush cost are kept below 15M gas.
};

const TestnetEntryQueueConfig = {
  bootstrapValidatorSetSize: 750n,
  bootstrapFlushSize: 32n,
  normalFlushSizeMin: 32n,
  normalFlushSizeQuotient: 2475n,
  maxQueueFlushSize: 32n,
};

const StagingIgnitionEntryQueueConfig = {
  bootstrapValidatorSetSize: 48n,
  bootstrapFlushSize: 48n,
  normalFlushSizeMin: 1n,
  normalFlushSizeQuotient: 2048n,
  maxQueueFlushSize: 24n,
};

export const getEntryQueueConfig = (networkName: NetworkNames) => {
  switch (networkName) {
    case 'local':
      return LocalEntryQueueConfig;
    case 'next-net':
      return LocalEntryQueueConfig;
    case 'staging-public':
      return StagingPublicEntryQueueConfig;
    case 'testnet':
      return TestnetEntryQueueConfig;
    case 'staging-ignition':
      return StagingIgnitionEntryQueueConfig;
    default:
      throw new Error(`Unrecognized network name: ${networkName}`);
  }
};

export const l1ContractsConfigMappings: ConfigMappingsType<L1ContractsConfig> = {
  ethereumSlotDuration: {
    env: 'ETHEREUM_SLOT_DURATION',
    description: 'How many seconds an L1 slot lasts.',
    ...numberConfigHelper(DefaultL1ContractsConfig.ethereumSlotDuration),
  },
  aztecSlotDuration: {
    env: 'AZTEC_SLOT_DURATION',
    description: 'How many seconds an L2 slots lasts (must be multiple of ethereum slot duration).',
    ...numberConfigHelper(DefaultL1ContractsConfig.aztecSlotDuration),
  },
  aztecEpochDuration: {
    env: 'AZTEC_EPOCH_DURATION',
    description: `How many L2 slots an epoch lasts (maximum AZTEC_MAX_EPOCH_DURATION).`,
    ...numberConfigHelper(DefaultL1ContractsConfig.aztecEpochDuration),
  },
  aztecTargetCommitteeSize: {
    env: 'AZTEC_TARGET_COMMITTEE_SIZE',
    description: 'The target validator committee size.',
    ...numberConfigHelper(DefaultL1ContractsConfig.aztecTargetCommitteeSize),
  },
  lagInEpochs: {
    env: 'AZTEC_LAG_IN_EPOCHS',
    description: 'The number of epochs to lag behind the current epoch for validator selection.',
    ...numberConfigHelper(DefaultL1ContractsConfig.lagInEpochs),
  },
  aztecProofSubmissionEpochs: {
    env: 'AZTEC_PROOF_SUBMISSION_EPOCHS',
    description: 'The number of epochs after an epoch ends that proofs are still accepted.',
    ...numberConfigHelper(DefaultL1ContractsConfig.aztecProofSubmissionEpochs),
  },
  activationThreshold: {
    env: 'AZTEC_ACTIVATION_THRESHOLD',
    description: 'The deposit amount for a validator',
    ...bigintConfigHelper(DefaultL1ContractsConfig.activationThreshold),
  },
  ejectionThreshold: {
    env: 'AZTEC_EJECTION_THRESHOLD',
    description: 'The minimum stake for a validator.',
    ...bigintConfigHelper(DefaultL1ContractsConfig.ejectionThreshold),
  },
  localEjectionThreshold: {
    env: 'AZTEC_LOCAL_EJECTION_THRESHOLD',
    description:
      'The local ejection threshold for a validator. Stricter than ejectionThreshold but local to a specific rollup',
    ...bigintConfigHelper(DefaultL1ContractsConfig.localEjectionThreshold),
  },
  slashingOffsetInRounds: {
    env: 'AZTEC_SLASHING_OFFSET_IN_ROUNDS',
    description:
      'How many slashing rounds back we slash (ie when slashing in round N, we slash for offenses committed during epochs of round N-offset)',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingOffsetInRounds),
  },
  slasherFlavor: {
    env: 'AZTEC_SLASHER_FLAVOR',
    description: 'Type of slasher proposer (empire, tally, or none)',
    ...enumConfigHelper(['empire', 'tally', 'none'] as const, DefaultL1ContractsConfig.slasherFlavor),
  },
  slashAmountSmall: {
    env: 'AZTEC_SLASH_AMOUNT_SMALL',
    description: 'Small slashing amount for light offenses',
    ...bigintConfigHelper(DefaultL1ContractsConfig.slashAmountSmall),
  },
  slashAmountMedium: {
    env: 'AZTEC_SLASH_AMOUNT_MEDIUM',
    description: 'Medium slashing amount for moderate offenses',
    ...bigintConfigHelper(DefaultL1ContractsConfig.slashAmountMedium),
  },
  slashAmountLarge: {
    env: 'AZTEC_SLASH_AMOUNT_LARGE',
    description: 'Large slashing amount for severe offenses',
    ...bigintConfigHelper(DefaultL1ContractsConfig.slashAmountLarge),
  },
  slashingQuorum: {
    env: 'AZTEC_SLASHING_QUORUM',
    description: 'The slashing quorum',
    ...optionalNumberConfigHelper(),
  },
  slashingRoundSizeInEpochs: {
    env: 'AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS',
    description: 'The slashing round size',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingRoundSizeInEpochs),
  },
  slashingLifetimeInRounds: {
    env: 'AZTEC_SLASHING_LIFETIME_IN_ROUNDS',
    description: 'The slashing lifetime in rounds',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingLifetimeInRounds),
  },
  slashingExecutionDelayInRounds: {
    env: 'AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS',
    description: 'The slashing execution delay in rounds',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingExecutionDelayInRounds),
  },
  slashingVetoer: {
    env: 'AZTEC_SLASHING_VETOER',
    description: 'The slashing vetoer',
    parseEnv: (val: string) => EthAddress.fromString(val),
    defaultValue: DefaultL1ContractsConfig.slashingVetoer,
  },
  slashingDisableDuration: {
    env: 'AZTEC_SLASHING_DISABLE_DURATION',
    description: 'How long slashing can be disabled for in seconds when vetoer disables it',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingDisableDuration),
  },
  governanceProposerQuorum: {
    env: 'AZTEC_GOVERNANCE_PROPOSER_QUORUM',
    description: 'The governance proposing quorum',
    ...optionalNumberConfigHelper(),
  },
  governanceProposerRoundSize: {
    env: 'AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE',
    description: 'The governance proposing round size',
    ...numberConfigHelper(DefaultL1ContractsConfig.governanceProposerRoundSize),
  },
  manaTarget: {
    env: 'AZTEC_MANA_TARGET',
    description: 'The mana target for the rollup',
    ...bigintConfigHelper(DefaultL1ContractsConfig.manaTarget),
  },
  provingCostPerMana: {
    env: 'AZTEC_PROVING_COST_PER_MANA',
    description: 'The proving cost per mana',
    ...bigintConfigHelper(DefaultL1ContractsConfig.provingCostPerMana),
  },
  exitDelaySeconds: {
    env: 'AZTEC_EXIT_DELAY_SECONDS',
    description: 'The delay before a validator can exit the set',
    ...numberConfigHelper(DefaultL1ContractsConfig.exitDelaySeconds),
  },
  ...l1TxUtilsConfigMappings,
};

export const genesisStateConfigMappings: ConfigMappingsType<GenesisStateConfig> = {
  testAccounts: {
    env: 'TEST_ACCOUNTS',
    description: 'Whether to populate the genesis state with initial fee juice for the test accounts.',
    ...booleanConfigHelper(false),
  },
  sponsoredFPC: {
    env: 'SPONSORED_FPC',
    description: 'Whether to populate the genesis state with initial fee juice for the sponsored FPC.',
    ...booleanConfigHelper(false),
  },
};

export function getL1ContractsConfigEnvVars(): L1ContractsConfig {
  return getConfigFromMappings(l1ContractsConfigMappings);
}

export function getGenesisStateConfigEnvVars(): GenesisStateConfig {
  return getConfigFromMappings(genesisStateConfigMappings);
}

/**
 * Validates the L1 contracts configuration to ensure all requirements enforced by L1 contracts
 * during construction are satisfied before deployment.
 * Accumulates all validation errors and throws an exception listing them all if any are found.
 */
export function validateConfig(config: Omit<L1ContractsConfig, keyof L1TxUtilsConfig>): void {
  const errors: string[] = [];

  // RollupCore constructor validation: normalFlushSizeMin > 0
  // From: require(_config.stakingQueueConfig.normalFlushSizeMin > 0, Errors.Staking__InvalidStakingQueueConfig());
  const entryQueueConfig = getEntryQueueConfig('testnet'); // Get config to check normalFlushSizeMin
  if (entryQueueConfig.normalFlushSizeMin <= 0n) {
    errors.push('normalFlushSizeMin must be greater than 0');
  }

  // TimeLib initialization validation: aztecSlotDuration should be a multiple of ethereumSlotDuration
  // While not explicitly required in constructor, this is a common validation for time-based systems
  if (config.aztecSlotDuration % config.ethereumSlotDuration !== 0) {
    errors.push(
      `aztecSlotDuration (${config.aztecSlotDuration}) must be a multiple of ethereumSlotDuration (${config.ethereumSlotDuration})`,
    );
  }

  // EmpireBase constructor validations for governance/slashing proposers
  // From: require(QUORUM_SIZE > ROUND_SIZE / 2, Errors.EmpireBase__InvalidQuorumAndRoundSize(QUORUM_SIZE, ROUND_SIZE));
  const { governanceProposerQuorum, governanceProposerRoundSize } = config;
  if (
    governanceProposerQuorum !== undefined &&
    governanceProposerQuorum <= Math.floor(governanceProposerRoundSize / 2)
  ) {
    errors.push(
      `governanceProposerQuorum (${governanceProposerQuorum}) must be greater than half of governanceProposerRoundSize (${Math.floor(governanceProposerRoundSize / 2)})`,
    );
  }

  // From: require(QUORUM_SIZE <= ROUND_SIZE, Errors.EmpireBase__QuorumCannotBeLargerThanRoundSize(QUORUM_SIZE, ROUND_SIZE));
  if (governanceProposerQuorum !== undefined && governanceProposerQuorum > governanceProposerRoundSize) {
    errors.push(
      `governanceProposerQuorum (${governanceProposerQuorum}) cannot be larger than governanceProposerRoundSize (${governanceProposerRoundSize})`,
    );
  }

  // Slashing quorum validations (similar to governance quorum)
  const slashingRoundSize = config.slashingRoundSizeInEpochs * config.aztecEpochDuration;
  const { slashingQuorum } = config;
  if (slashingQuorum !== undefined && slashingQuorum <= Math.floor(slashingRoundSize / 2)) {
    errors.push(
      `slashingQuorum (${slashingQuorum}) must be greater than half of slashingRoundSizeInEpochs (${Math.floor(slashingRoundSize / 2)})`,
    );
  }

  if (slashingQuorum !== undefined && slashingQuorum > slashingRoundSize) {
    errors.push(
      `slashingQuorum (${slashingQuorum}) cannot be larger than slashingRoundSizeInEpochs (${slashingRoundSize})`,
    );
  }

  // EmpireBase and TallySlashingProposer lifetime and execution delay validation
  // From: require(LIFETIME_IN_ROUNDS > EXECUTION_DELAY_IN_ROUNDS);
  if (config.slashingLifetimeInRounds <= config.slashingExecutionDelayInRounds) {
    errors.push(
      `slashingLifetimeInRounds (${config.slashingLifetimeInRounds}) must be greater than slashingExecutionDelayInRounds (${config.slashingExecutionDelayInRounds})`,
    );
  }

  // Staking asset validation: activationThreshold > ejectionThreshold
  if (config.activationThreshold < config.ejectionThreshold) {
    errors.push(
      `activationThreshold (${config.activationThreshold}) must be greater than ejectionThreshold (${config.ejectionThreshold})`,
    );
  }

  // TallySlashingProposer constructor validations
  if (config.slasherFlavor === 'tally') {
    validateTallySlasherConfig(config, errors);
  }

  // Epoch and slot duration validations
  if (config.aztecSlotDuration <= 0) {
    errors.push('aztecSlotDuration must be greater than 0');
  }

  if (config.ethereumSlotDuration <= 0) {
    errors.push('ethereumSlotDuration must be greater than 0');
  }

  if (config.aztecEpochDuration <= 0) {
    errors.push('aztecEpochDuration must be greater than 0');
  }

  // Committee size validation
  if (config.aztecTargetCommitteeSize < 0) {
    errors.push('aztecTargetCommitteeSize cannot be negative');
  }

  // Proof submission epochs validation
  if (config.aztecProofSubmissionEpochs < 0) {
    errors.push('aztecProofSubmissionEpochs cannot be negative');
  }

  // Exit delay validation
  if (config.exitDelaySeconds < 0) {
    errors.push('exitDelaySeconds cannot be negative');
  }

  // Mana validation
  if (config.manaTarget < 0n) {
    errors.push('manaTarget cannot be negative');
  }

  if (config.provingCostPerMana < 0n) {
    errors.push('provingCostPerMana cannot be negative');
  }

  // If any errors were found, throw an exception with all of them
  if (errors.length > 0) {
    throw new Error(
      `L1 contracts configuration validation failed with ${errors.length} error(s):\n${errors.map((error, index) => `${index + 1}. ${error}`).join('\n')}`,
    );
  }
}

function validateTallySlasherConfig(config: L1ContractsConfig, errors: string[]) {
  if (config.slasherFlavor !== 'tally') {
    return;
  }

  // From: require(SLASH_OFFSET_IN_ROUNDS > 0, Errors.TallySlashingProposer__SlashOffsetMustBeGreaterThanZero(...));
  if (config.slashingOffsetInRounds <= 0) {
    errors.push(`slashingOffsetInRounds (${config.slashingOffsetInRounds}) must be greater than 0`);
  }

  // From: require(ROUND_SIZE_IN_EPOCHS * _epochDuration == ROUND_SIZE, Errors.TallySlashingProposer__RoundSizeMustBeMultipleOfEpochDuration(...));
  const roundSizeInSlots = config.slashingRoundSizeInEpochs * config.aztecEpochDuration;

  // From: require(QUORUM > 0, Errors.TallySlashingProposer__QuorumMustBeGreaterThanZero());
  const { slashingQuorum } = config;
  if (slashingQuorum !== undefined && slashingQuorum <= 0) {
    errors.push(`slashingQuorum (${slashingQuorum}) must be greater than 0`);
  }

  // From: require(ROUND_SIZE > 1, Errors.TallySlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
  if (roundSizeInSlots <= 1) {
    errors.push(`slashing round size in slots (${roundSizeInSlots}) must be greater than 1`);
  }

  // From: require(_slashAmounts[0] <= _slashAmounts[1], Errors.TallySlashingProposer__InvalidSlashAmounts(_slashAmounts));
  if (config.slashAmountSmall > config.slashAmountMedium) {
    errors.push(
      `slashAmountSmall (${config.slashAmountSmall}) must be less than or equal to slashAmountMedium (${config.slashAmountMedium})`,
    );
  }

  // From: require(_slashAmounts[1] <= _slashAmounts[2], Errors.TallySlashingProposer__InvalidSlashAmounts(_slashAmounts));
  if (config.slashAmountMedium > config.slashAmountLarge) {
    errors.push(
      `slashAmountMedium (${config.slashAmountMedium}) must be less than or equal to slashAmountLarge (${config.slashAmountLarge})`,
    );
  }

  // From: require(LIFETIME_IN_ROUNDS < ROUNDABOUT_SIZE, Errors.TallySlashingProposer__LifetimeMustBeLessThanRoundabout(...));
  const ROUNDABOUT_SIZE = 128; // Constant from TallySlashingProposer
  if (config.slashingLifetimeInRounds >= ROUNDABOUT_SIZE) {
    errors.push(`slashingLifetimeInRounds (${config.slashingLifetimeInRounds}) must be less than ${ROUNDABOUT_SIZE}`);
  }

  // From: require(ROUND_SIZE_IN_EPOCHS > 0, Errors.TallySlashingProposer__RoundSizeInEpochsMustBeGreaterThanZero(...));
  if (config.slashingRoundSizeInEpochs <= 0) {
    errors.push(`slashingRoundSizeInEpochs (${config.slashingRoundSizeInEpochs}) must be greater than 0`);
  }

  // From: require(ROUND_SIZE < MAX_ROUND_SIZE, Errors.TallySlashingProposer__RoundSizeTooLarge(ROUND_SIZE, MAX_ROUND_SIZE));
  const MAX_ROUND_SIZE = 1024; // Constant from TallySlashingProposer
  if (roundSizeInSlots >= MAX_ROUND_SIZE) {
    errors.push(`slashing round size in slots (${roundSizeInSlots}) must be less than ${MAX_ROUND_SIZE}`);
  }

  // From: require(COMMITTEE_SIZE > 0, Errors.TallySlashingProposer__CommitteeSizeMustBeGreaterThanZero(COMMITTEE_SIZE));
  if (config.aztecTargetCommitteeSize <= 0) {
    errors.push(`aztecTargetCommitteeSize (${config.aztecTargetCommitteeSize}) must be greater than 0`);
  }

  // From: require(voteSize <= 128, Errors.TallySlashingProposer__VoteSizeTooBig(voteSize, 128));
  // voteSize = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4
  const voteSize = (config.aztecTargetCommitteeSize * config.slashingRoundSizeInEpochs) / 4;
  if (voteSize > 128) {
    errors.push(`vote size (${voteSize}) must be <= 128 (committee size * round size in epochs / 4)`);
  }

  // From: require(COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS % 4 == 0, Errors.TallySlashingProposer__InvalidCommitteeAndRoundSize(...));
  if ((config.aztecTargetCommitteeSize * config.slashingRoundSizeInEpochs) % 4 !== 0) {
    errors.push(
      `aztecTargetCommitteeSize * slashingRoundSizeInEpochs (${config.aztecTargetCommitteeSize * config.slashingRoundSizeInEpochs}) must be divisible by 4`,
    );
  }

  // Slashing offset validation: should be positive to allow proper slashing timing
  if (config.slashingOffsetInRounds < 0) {
    errors.push('slashingOffsetInRounds cannot be negative');
  }
}
