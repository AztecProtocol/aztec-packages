import {
  type ConfigMappingsType,
  bigintConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';

export type L1ContractsConfig = {
  /** How many seconds an L1 slot lasts. */
  ethereumSlotDuration: number;
  /** How many seconds an L2 slots lasts (must be multiple of ethereum slot duration). */
  aztecSlotDuration: number;
  /** How many L2 slots an epoch lasts. */
  aztecEpochDuration: number;
  /** The target validator committee size. */
  aztecTargetCommitteeSize: number;
  /** The number of L2 slots that we can wait for a proof of an epoch to be produced. */
  aztecEpochProofClaimWindowInL2Slots: number;
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
  /** The version of the rollup. */
  rollupVersion: number;
};

export const DefaultL1ContractsConfig = {
  ethereumSlotDuration: 12,
  aztecSlotDuration: 24,
  aztecEpochDuration: 16,
  aztecTargetCommitteeSize: 48,
  aztecEpochProofClaimWindowInL2Slots: 13,
  minimumStake: BigInt(100e18),
  slashingQuorum: 6,
  slashingRoundSize: 10,
  governanceProposerQuorum: 6,
  governanceProposerRoundSize: 10,
  rollupVersion: 1,
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
  aztecEpochProofClaimWindowInL2Slots: {
    env: 'AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS',
    description: 'The number of L2 slots that we can wait for a proof of an epoch to be produced.',
    ...numberConfigHelper(DefaultL1ContractsConfig.aztecEpochProofClaimWindowInL2Slots),
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
  rollupVersion: {
    env: 'ROLLUP_VERSION',
    description: 'The version of the rollup.',
    defaultValue: DefaultL1ContractsConfig.rollupVersion,
    ...numberConfigHelper(DefaultL1ContractsConfig.rollupVersion),
  },
};

export function getL1ContractsConfigEnvVars(): L1ContractsConfig {
  return getConfigFromMappings(l1ContractsConfigMappings);
}
