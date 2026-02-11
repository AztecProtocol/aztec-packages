import {
  type ConfigMappingsType,
  bigintConfigHelper,
  booleanConfigHelper,
  enumConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  omitConfigMappings,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

import { l1ContractsDefaultEnv } from './generated/l1-contracts-defaults.js';
import { type L1TxUtilsConfig, l1TxUtilsConfigMappings } from './l1_tx_utils/config.js';

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
  /** The number of checkpoints to lag in the inbox (prevents sequencer DOS attacks). */
  inboxLag: number;
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
  /** Governance voting duration in seconds (only for local/devnet/next-net, default 3600) */
  governanceVotingDuration?: number;
  /** The mana target for the rollup */
  manaTarget: bigint;
  /** The proving cost per mana */
  provingCostPerMana: bigint;
  /** The initial ETH per fee asset price (with 1e12 precision) */
  initialEthPerFeeAsset: bigint;
  /** The number of seconds to wait for an exit */
  exitDelaySeconds: number;
} & L1TxUtilsConfig;

/**
 * Config mappings for L1ContractsConfig.
 * Default values come from generated l1-contracts-defaults.json (source: defaults.yml).
 * Real deployments use forge scripts which require explicit env vars (vm.envUint).
 */
export const l1ContractsConfigMappings: ConfigMappingsType<L1ContractsConfig> = {
  ethereumSlotDuration: {
    env: 'ETHEREUM_SLOT_DURATION',
    description: 'How many seconds an L1 slot lasts.',
    ...numberConfigHelper(l1ContractsDefaultEnv.ETHEREUM_SLOT_DURATION),
  },
  aztecSlotDuration: {
    env: 'AZTEC_SLOT_DURATION',
    description: 'How many seconds an L2 slots lasts (must be multiple of ethereum slot duration).',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_SLOT_DURATION),
  },
  aztecEpochDuration: {
    env: 'AZTEC_EPOCH_DURATION',
    description: `How many L2 slots an epoch lasts (maximum MAX_CHECKPOINTS_PER_EPOCH).`,
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_EPOCH_DURATION),
  },
  aztecTargetCommitteeSize: {
    env: 'AZTEC_TARGET_COMMITTEE_SIZE',
    description: 'The target validator committee size.',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_TARGET_COMMITTEE_SIZE),
  },
  lagInEpochsForValidatorSet: {
    env: 'AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET',
    description: 'The number of epochs to lag behind the current epoch for validator selection.',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET),
  },
  lagInEpochsForRandao: {
    env: 'AZTEC_LAG_IN_EPOCHS_FOR_RANDAO',
    description: 'The number of epochs to lag behind the current epoch for randao selection.',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_LAG_IN_EPOCHS_FOR_RANDAO),
  },
  inboxLag: {
    env: 'AZTEC_INBOX_LAG',
    description: 'The number of checkpoints to lag in the inbox (prevents sequencer DOS attacks).',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_INBOX_LAG),
  },
  aztecProofSubmissionEpochs: {
    env: 'AZTEC_PROOF_SUBMISSION_EPOCHS',
    description: 'The number of epochs after an epoch ends that proofs are still accepted.',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_PROOF_SUBMISSION_EPOCHS),
  },
  activationThreshold: {
    env: 'AZTEC_ACTIVATION_THRESHOLD',
    description: 'The deposit amount for a validator',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_ACTIVATION_THRESHOLD)),
  },
  ejectionThreshold: {
    env: 'AZTEC_EJECTION_THRESHOLD',
    description: 'The minimum stake for a validator.',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_EJECTION_THRESHOLD)),
  },
  localEjectionThreshold: {
    env: 'AZTEC_LOCAL_EJECTION_THRESHOLD',
    description:
      'The local ejection threshold for a validator. Stricter than ejectionThreshold but local to a specific rollup',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_LOCAL_EJECTION_THRESHOLD)),
  },
  slashingOffsetInRounds: {
    env: 'AZTEC_SLASHING_OFFSET_IN_ROUNDS',
    description:
      'How many slashing rounds back we slash (ie when slashing in round N, we slash for offenses committed during epochs of round N-offset)',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_SLASHING_OFFSET_IN_ROUNDS),
  },
  slasherFlavor: {
    env: 'AZTEC_SLASHER_FLAVOR',
    description: 'Type of slasher proposer (empire, tally, or none)',
    ...enumConfigHelper(
      ['empire', 'tally', 'none'] as const,
      l1ContractsDefaultEnv.AZTEC_SLASHER_FLAVOR as 'empire' | 'tally' | 'none',
    ),
  },
  slashAmountSmall: {
    env: 'AZTEC_SLASH_AMOUNT_SMALL',
    description: 'Small slashing amount for light offenses',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_SLASH_AMOUNT_SMALL)),
  },
  slashAmountMedium: {
    env: 'AZTEC_SLASH_AMOUNT_MEDIUM',
    description: 'Medium slashing amount for moderate offenses',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_SLASH_AMOUNT_MEDIUM)),
  },
  slashAmountLarge: {
    env: 'AZTEC_SLASH_AMOUNT_LARGE',
    description: 'Large slashing amount for severe offenses',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_SLASH_AMOUNT_LARGE)),
  },
  slashingQuorum: {
    env: 'AZTEC_SLASHING_QUORUM',
    description: 'The slashing quorum',
    ...optionalNumberConfigHelper(),
  },
  slashingRoundSizeInEpochs: {
    env: 'AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS',
    description: 'The slashing round size',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS),
  },
  slashingLifetimeInRounds: {
    env: 'AZTEC_SLASHING_LIFETIME_IN_ROUNDS',
    description: 'The slashing lifetime in rounds',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_SLASHING_LIFETIME_IN_ROUNDS),
  },
  slashingExecutionDelayInRounds: {
    env: 'AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS',
    description: 'The slashing execution delay in rounds',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS),
  },
  slashingVetoer: {
    env: 'AZTEC_SLASHING_VETOER',
    description: 'The slashing vetoer',
    parseEnv: (val: string) => EthAddress.fromString(val),
    defaultValue: EthAddress.fromString(l1ContractsDefaultEnv.AZTEC_SLASHING_VETOER),
  },
  slashingDisableDuration: {
    env: 'AZTEC_SLASHING_DISABLE_DURATION',
    description: 'How long slashing can be disabled for in seconds when vetoer disables it',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_SLASHING_DISABLE_DURATION),
  },
  governanceProposerQuorum: {
    env: 'AZTEC_GOVERNANCE_PROPOSER_QUORUM',
    description: 'The governance proposing quorum',
    ...optionalNumberConfigHelper(),
  },
  governanceProposerRoundSize: {
    env: 'AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE',
    description: 'The governance proposing round size',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE),
  },
  governanceVotingDuration: {
    env: 'AZTEC_GOVERNANCE_VOTING_DURATION',
    description: 'Governance voting duration in seconds (only for local/devnet/next-net)',
    ...numberConfigHelper(3600), // 1 hour default, not in generated defaults as it's deployment-time only
  },
  manaTarget: {
    env: 'AZTEC_MANA_TARGET',
    description: 'The mana target for the rollup',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_MANA_TARGET)),
  },
  provingCostPerMana: {
    env: 'AZTEC_PROVING_COST_PER_MANA',
    description: 'The proving cost per mana',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_PROVING_COST_PER_MANA)),
  },
  initialEthPerFeeAsset: {
    env: 'AZTEC_INITIAL_ETH_PER_FEE_ASSET',
    description: 'The initial ETH per fee asset price (with 1e12 precision)',
    ...bigintConfigHelper(BigInt(l1ContractsDefaultEnv.AZTEC_INITIAL_ETH_PER_FEE_ASSET)),
  },
  exitDelaySeconds: {
    env: 'AZTEC_EXIT_DELAY_SECONDS',
    description: 'The delay before a validator can exit the set',
    ...numberConfigHelper(l1ContractsDefaultEnv.AZTEC_EXIT_DELAY_SECONDS),
  },
  ...omitConfigMappings(l1TxUtilsConfigMappings, ['ethereumSlotDuration']),
};

/**
 * Default L1 contracts configuration derived from l1ContractsConfigMappings.
 * Source of truth: spartan/environments/defaults.yml -> defaults.l1-contracts
 */
export const DefaultL1ContractsConfig = getDefaultConfig(l1ContractsConfigMappings);

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
