import {
  type ConfigMappingsType,
  type NetworkNames,
  bigintConfigHelper,
  booleanConfigHelper,
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
  depositAmount: bigint;
  /** The minimum stake for a validator. */
  minimumStake: bigint;
  /** The slashing quorum */
  slashingQuorum: number;
  /** The slashing round size */
  slashingRoundSize: number;
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
  depositAmount: BigInt(100e18),
  minimumStake: BigInt(50e18),
  slashingQuorum: 6,
  slashingRoundSize: 10,
  governanceProposerQuorum: 51,
  governanceProposerRoundSize: 100,
  manaTarget: BigInt(1e10),
  provingCostPerMana: BigInt(100),
  exitDelaySeconds: 2 * 24 * 60 * 60,
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
  quorum: 1n * 10n ** 17n,
  voteDifferential: 4n * 10n ** 16n,
  minimumVotes: 400n * 10n ** 18n,
};

const TestnetGovernanceConfiguration = {
  proposeConfig: {
    lockDelay: 60n * 60n * 24n,
    lockAmount: DefaultL1ContractsConfig.depositAmount * 100n,
  },
  votingDelay: 60n,
  votingDuration: 60n * 60n,
  executionDelay: 60n * 60n * 24n,
  gracePeriod: 60n * 60n * 24n * 7n,
  quorum: 3n * 10n ** 17n,
  voteDifferential: 4n * 10n ** 16n,
  minimumVotes: DefaultL1ContractsConfig.minimumStake * 200n,
};

export const getGovernanceConfiguration = (networkName: NetworkNames) => {
  if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    return TestnetGovernanceConfiguration;
  }
  return LocalGovernanceConfiguration;
};

// Making a default config here as we are only using it thought the deployment
// and do not expect to be using different setups, so having environment variables
// for it seems overkill
const LocalRewardConfig = {
  sequencerBps: 5000,
  rewardDistributor: EthAddress.ZERO.toString(),
  booster: EthAddress.ZERO.toString(),
};

const TestnetRewardConfig = {
  sequencerBps: 5000,
  rewardDistributor: EthAddress.ZERO.toString(),
  booster: EthAddress.ZERO.toString(),
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
  bootstrapValidatorSetSize: 0,
  bootstrapFlushSize: 0,
  normalFlushSizeMin: 48,
  normalFlushSizeQuotient: 2,
};

const TestnetEntryQueueConfig = {
  bootstrapValidatorSetSize: 750,
  bootstrapFlushSize: 75,
  normalFlushSizeMin: 1,
  normalFlushSizeQuotient: 2475,
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
  depositAmount: {
    env: 'AZTEC_DEPOSIT_AMOUNT',
    description: 'The deposit amount for a validator',
    ...bigintConfigHelper(DefaultL1ContractsConfig.depositAmount),
  },
  minimumStake: {
    env: 'AZTEC_MINIMUM_STAKE',
    description: 'The minimum stake for a validator.',
    ...bigintConfigHelper(DefaultL1ContractsConfig.minimumStake),
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
