import {
  type ConfigMappingsType,
  // type NetworkNames,
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
  lagInEpochsForValidatorSet: number;
  /** The number of epochs to lag behind the current epoch for randao selection. */
  lagInEpochsForRandao: number;
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
  lagInEpochsForValidatorSet: 2,
  lagInEpochsForRandao: 2, // For PROD, this value should be > lagInEpochsForValidatorSet
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
  manaTarget: BigInt(100e6),
  provingCostPerMana: BigInt(100),
  exitDelaySeconds: 2 * 24 * 60 * 60,
  slasherFlavor: 'tally' as const,
  slashingOffsetInRounds: 2,
  slashingDisableDuration: 5 * 24 * 60 * 60, // 5 days in seconds
} satisfies L1ContractsConfig;

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
  lagInEpochsForValidatorSet: {
    env: 'AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET',
    description: 'The number of epochs to lag behind the current epoch for validator selection.',
    ...numberConfigHelper(DefaultL1ContractsConfig.lagInEpochsForValidatorSet),
  },
  lagInEpochsForRandao: {
    env: 'AZTEC_LAG_IN_EPOCHS_FOR_RANDAO',
    description: 'The number of epochs to lag behind the current epoch for randao selection.',
    ...numberConfigHelper(DefaultL1ContractsConfig.lagInEpochsForRandao),
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
