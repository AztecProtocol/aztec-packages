import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';

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
};

export const DefaultL1ContractsConfig: L1ContractsConfig = {
  ethereumSlotDuration: 12,
  aztecSlotDuration: 24,
  aztecEpochDuration: 16,
  aztecTargetCommitteeSize: 48,
  aztecEpochProofClaimWindowInL2Slots: 13,
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
  aztecEpochProofClaimWindowInL2Slots: {
    env: 'AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS',
    description: 'The number of L2 slots that we can wait for a proof of an epoch to be produced.',
    ...numberConfigHelper(DefaultL1ContractsConfig.aztecEpochProofClaimWindowInL2Slots),
  },
};

export function getL1ContractsConfigEnvVars(): L1ContractsConfig {
  return getConfigFromMappings(l1ContractsConfigMappings);
}
