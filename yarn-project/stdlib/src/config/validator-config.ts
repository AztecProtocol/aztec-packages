import {
  type ConfigMappingsType,
  booleanConfigHelper,
  composeConfigMappings,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';

/** Config for fisherman mode, shared across validator-client, sequencer-client, p2p, and node-lib. */
export interface FishermanModeConfig {
  /** Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus. */
  fishermanMode?: boolean;
}

export const fishermanModeConfigMappings: ConfigMappingsType<FishermanModeConfig> = {
  fishermanMode: {
    env: 'FISHERMAN_MODE',
    description:
      'Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus.',
    ...booleanConfigHelper(false),
  },
};

/** Config for controlling whether proposed/re-executed blocks should be pushed to archiver. */
export interface PushProposedBlocksToArchiverConfig {
  /** Whether to skip pushing proposed/re-executed blocks to archiver. */
  skipPushProposedBlocksToArchiver?: boolean;
}

export const pushProposedBlocksToArchiverConfigMappings: ConfigMappingsType<PushProposedBlocksToArchiverConfig> = {
  skipPushProposedBlocksToArchiver: {
    description: 'Skip pushing proposed/re-executed blocks to archiver (default: false)',
    ...booleanConfigHelper(false),
  },
};

/** Testing-only flag to bypass proposal slot timing checks in validation and P2P gossip. */
export interface SkipProposalSlotValidationConfig {
  skipProposalSlotValidation?: boolean;
}

export const skipProposalSlotValidationConfigMappings: ConfigMappingsType<SkipProposalSlotValidationConfig> = {
  skipProposalSlotValidation: {
    description:
      'Accept block/checkpoint proposals regardless of slot timing in validation and P2P gossip (for testing only)',
    ...booleanConfigHelper(false),
  },
};

/** Validator block constraint config shared across validator-client and p2p. */
type OwnValidatorConstraintsConfig = {
  /** Maximum L2 block gas for validation. Proposals exceeding this limit are rejected. */
  validateMaxL2BlockGas?: number;
  /** Maximum DA block gas for validation. Proposals exceeding this limit are rejected. */
  validateMaxDABlockGas?: number;
  /** Maximum transactions per block for validation. Proposals exceeding this limit are rejected. */
  validateMaxTxsPerBlock?: number;
  /** Maximum transactions per checkpoint for validation. Proposals exceeding this limit are rejected. */
  validateMaxTxsPerCheckpoint?: number;
};

export type ValidatorConstraintsConfig = OwnValidatorConstraintsConfig &
  FishermanModeConfig &
  SkipProposalSlotValidationConfig;

const ownValidatorConstraintsConfigMappings: ConfigMappingsType<OwnValidatorConstraintsConfig> = {
  validateMaxL2BlockGas: {
    env: 'VALIDATOR_MAX_L2_BLOCK_GAS',
    description: 'Maximum L2 block gas for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
  validateMaxDABlockGas: {
    env: 'VALIDATOR_MAX_DA_BLOCK_GAS',
    description: 'Maximum DA block gas for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
  validateMaxTxsPerBlock: {
    env: 'VALIDATOR_MAX_TX_PER_BLOCK',
    description: 'Maximum transactions per block for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
  validateMaxTxsPerCheckpoint: {
    env: 'VALIDATOR_MAX_TX_PER_CHECKPOINT',
    description: 'Maximum transactions per checkpoint for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
};

export const validatorConstraintsConfigMappings: ConfigMappingsType<ValidatorConstraintsConfig> = composeConfigMappings(
  fishermanModeConfigMappings,
  skipProposalSlotValidationConfigMappings,
  ownValidatorConstraintsConfigMappings,
);
