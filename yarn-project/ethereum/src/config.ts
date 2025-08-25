import {
  type ConfigMappingsType,
  type NetworkNames,
  bigintConfigHelper,
  booleanConfigHelper,
  enumConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

import { type L1TxUtilsConfig, l1TxUtilsConfigMappings } from './l1_tx_utils.js';

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
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: number;
  /** The deposit amount for a validator */
  activationThreshold: bigint;
  /** The minimum stake for a validator. */
  ejectionThreshold: bigint;
  /** The slashing quorum, i.e. how many slots must signal for the same payload in a round for it to be submittable to the Slasher */
  slashingQuorum: number;
  /** The slashing round size, i.e. how many slots are in a round */
  slashingRoundSize: number;
  /** The slashing lifetime in rounds. I.e., if 1, round N must be submitted before round N + 2 */
  slashingLifetimeInRounds: number;
  /** The slashing execution delay in rounds. I.e., if 1, round N may not be submitted until round N + 2 */
  slashingExecutionDelayInRounds: number;
  /** The slashing vetoer. May blacklist a payload from being submitted. */
  slashingVetoer: EthAddress;
  /** How many slashing rounds back we slash (ie when slashing in round N, we slash for offenses committed during epochs of round N-offset) */
  slashingOffsetInRounds: number;
  /** Type of slasher proposer */
  slasherFlavor: 'empire' | 'tally';
  /** Minimum slashing unit for consensus-based slashing (all slashes will be a 1-15x this value) */
  slashingUnit: bigint;
  /** Governance proposing quorum */
  governanceProposerQuorum: number;
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
  aztecProofSubmissionEpochs: 1, // you have a full epoch to submit a proof after the epoch to prove ends
  activationThreshold: BigInt(100e18),
  ejectionThreshold: BigInt(50e18),
  slashingUnit: BigInt(5e18),
  slashingQuorum: 101,
  slashingRoundSize: 200,
  slashingLifetimeInRounds: 5,
  slashingExecutionDelayInRounds: 0, // round N may be submitted in round N + 1
  slashingVetoer: EthAddress.ZERO,
  governanceProposerQuorum: 151,
  governanceProposerRoundSize: 300,
  manaTarget: BigInt(1e10),
  provingCostPerMana: BigInt(100),
  exitDelaySeconds: 2 * 24 * 60 * 60,
  slasherFlavor: 'empire' as const,
  slashingOffsetInRounds: 2,
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

const TestnetGovernanceConfiguration = {
  proposeConfig: {
    lockDelay: 60n * 60n * 24n,
    lockAmount: DefaultL1ContractsConfig.activationThreshold * 100n,
  },
  votingDelay: 60n,
  votingDuration: 60n * 60n,
  executionDelay: 60n * 60n * 24n,
  gracePeriod: 60n * 60n * 24n * 7n,
  quorum: 3n * 10n ** 17n, // 30%
  requiredYeaMargin: 4n * 10n ** 16n, // 4%
  minimumVotes: DefaultL1ContractsConfig.ejectionThreshold * 200n,
};

export const getGovernanceConfiguration = (networkName: NetworkNames) => {
  if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    return TestnetGovernanceConfiguration;
  }
  return LocalGovernanceConfiguration;
};

const TestnetGSEConfiguration = {
  activationThreshold: BigInt(100e18),
  ejectionThreshold: BigInt(50e18),
};

const LocalGSEConfiguration = {
  activationThreshold: BigInt(100e18),
  ejectionThreshold: BigInt(50e18),
};

export const getGSEConfiguration = (networkName: NetworkNames) => {
  if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    return TestnetGSEConfiguration;
  }
  return LocalGSEConfiguration;
};

// Making a default config here as we are only using it thought the deployment
// and do not expect to be using different setups, so having environment variables
// for it seems overkill
const LocalRewardConfig = {
  sequencerBps: 5000,
  rewardDistributor: EthAddress.ZERO.toString(),
  booster: EthAddress.ZERO.toString(),
  blockReward: BigInt(50e18),
};

const TestnetRewardConfig = {
  sequencerBps: 5000,
  rewardDistributor: EthAddress.ZERO.toString(),
  booster: EthAddress.ZERO.toString(),
  blockReward: BigInt(50e18),
};

export const getRewardConfig = (networkName: NetworkNames) => {
  if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    return TestnetRewardConfig;
  }
  return LocalRewardConfig;
};

const LocalRewardBoostConfig = {
  increment: 200000,
  maxScore: 5000000,
  a: 5000,
  k: 1000000,
  minimum: 100000,
};

const TestnetRewardBoostConfig = {
  increment: 125000,
  maxScore: 15000000,
  a: 1000,
  k: 1000000,
  minimum: 100000,
};

export const getRewardBoostConfig = (networkName: NetworkNames) => {
  if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    return TestnetRewardBoostConfig;
  }
  return LocalRewardBoostConfig;
};

// Similar to the above, no need for environment variables for this.
const LocalEntryQueueConfig = {
  bootstrapValidatorSetSize: 0n,
  bootstrapFlushSize: 0n,
  normalFlushSizeMin: 48n,
  normalFlushSizeQuotient: 2n,
};

const TestnetEntryQueueConfig = {
  bootstrapValidatorSetSize: 750n,
  bootstrapFlushSize: 75n,
  normalFlushSizeMin: 1n,
  normalFlushSizeQuotient: 2475n,
};

export const getEntryQueueConfig = (networkName: NetworkNames) => {
  if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    return TestnetEntryQueueConfig;
  }
  return LocalEntryQueueConfig;
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
  slashingOffsetInRounds: {
    env: 'AZTEC_SLASHING_OFFSET_IN_ROUNDS',
    description:
      'How many slashing rounds back we slash (ie when slashing in round N, we slash for offenses committed during epochs of round N-offset)',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingOffsetInRounds),
  },
  slasherFlavor: {
    env: 'AZTEC_SLASHER_FLAVOR',
    description: 'Type of slasher proposer (empire or tally)',
    ...enumConfigHelper(['empire', 'tally'] as const, DefaultL1ContractsConfig.slasherFlavor),
  },
  slashingUnit: {
    env: 'AZTEC_SLASHING_UNIT',
    description: 'Minimum slashing unit for consensus-based slashing (all slashes will be a 1-15x this value)',
    ...bigintConfigHelper(DefaultL1ContractsConfig.slashingUnit),
  },
  slashingQuorum: {
    env: 'AZTEC_SLASHING_QUORUM',
    description: 'The slashing quorum',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingQuorum),
  },
  slashingRoundSize: {
    env: 'AZTEC_SLASHING_ROUND_SIZE',
    description: 'The slashing round size',
    ...numberConfigHelper(DefaultL1ContractsConfig.slashingRoundSize),
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
  governanceProposerQuorum: {
    env: 'AZTEC_GOVERNANCE_PROPOSER_QUORUM',
    description: 'The governance proposing quorum',
    ...numberConfigHelper(DefaultL1ContractsConfig.governanceProposerQuorum),
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
