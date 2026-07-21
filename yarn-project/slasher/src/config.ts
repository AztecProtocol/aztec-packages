import type { ConfigMappingsType } from '@aztec/foundation/config';
import {
  bigintConfigHelper,
  booleanConfigHelper,
  floatConfigHelper,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';

import { slasherDefaultEnv } from './generated/slasher-defaults.js';

export type { SlasherConfig };

export const DefaultSlasherConfig: SlasherConfig = {
  slashOverridePayload: undefined,
  slashValidatorsAlways: [], // Empty by default
  slashValidatorsNever: [], // Empty by default
  slashDataWithholdingPenalty: BigInt(slasherDefaultEnv.SLASH_DATA_WITHHOLDING_PENALTY),
  slashDataWithholdingToleranceSlots: slasherDefaultEnv.SLASH_DATA_WITHHOLDING_TOLERANCE_SLOTS,
  slashInactivityTargetPercentage: slasherDefaultEnv.SLASH_INACTIVITY_TARGET_PERCENTAGE,
  slashInactivityConsecutiveEpochThreshold: slasherDefaultEnv.SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD,
  slashBroadcastedInvalidBlockPenalty: BigInt(slasherDefaultEnv.SLASH_INVALID_BLOCK_PENALTY),
  slashBroadcastedInvalidCheckpointProposalPenalty: BigInt(slasherDefaultEnv.SLASH_INVALID_CHECKPOINT_PROPOSAL_PENALTY),
  slashDuplicateProposalPenalty: BigInt(slasherDefaultEnv.SLASH_DUPLICATE_PROPOSAL_PENALTY),
  slashDuplicateAttestationPenalty: BigInt(slasherDefaultEnv.SLASH_DUPLICATE_ATTESTATION_PENALTY),
  slashInactivityPenalty: BigInt(slasherDefaultEnv.SLASH_INACTIVITY_PENALTY),
  slashProposeInvalidAttestationsPenalty: BigInt(slasherDefaultEnv.SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY),
  slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty: BigInt(
    slasherDefaultEnv.SLASH_PROPOSE_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS_PENALTY,
  ),
  slashAttestInvalidCheckpointProposalPenalty: BigInt(
    slasherDefaultEnv.SLASH_ATTEST_INVALID_CHECKPOINT_PROPOSAL_PENALTY,
  ),
  slashUnknownPenalty: BigInt(slasherDefaultEnv.SLASH_UNKNOWN_PENALTY),
  slashOffenseExpirationRounds: slasherDefaultEnv.SLASH_OFFENSE_EXPIRATION_ROUNDS,
  slashMaxPayloadSize: slasherDefaultEnv.SLASH_MAX_PAYLOAD_SIZE,
  slashGracePeriodL2Slots: slasherDefaultEnv.SLASH_GRACE_PERIOD_L2_SLOTS,
  slashExecuteRoundsLookBack: slasherDefaultEnv.SLASH_EXECUTE_ROUNDS_LOOK_BACK,
  slashSelfAllowed: false,
};

export const slasherConfigMappings: ConfigMappingsType<SlasherConfig> = {
  slashOverridePayload: {
    env: 'SLASH_OVERRIDE_PAYLOAD',
    description: 'An Ethereum address for a slash payload to vote for unconditionally.',
    parseEnv: (val: string) => EthAddress.fromString(val),
    defaultValue: DefaultSlasherConfig.slashOverridePayload,
  },
  slashValidatorsAlways: {
    env: 'SLASH_VALIDATORS_ALWAYS',
    description: 'Comma-separated list of validator addresses that should always be slashed.',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0)
        .map(addr => EthAddress.fromString(addr)),
    defaultValue: DefaultSlasherConfig.slashValidatorsAlways,
  },
  slashValidatorsNever: {
    env: 'SLASH_VALIDATORS_NEVER',
    description: 'Comma-separated list of validator addresses that should never be slashed.',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0)
        .map(addr => EthAddress.fromString(addr)),
    defaultValue: DefaultSlasherConfig.slashValidatorsNever,
  },
  slashDataWithholdingPenalty: {
    env: 'SLASH_DATA_WITHHOLDING_PENALTY',
    description: 'Penalty for data withholding (0 records offenses without slash votes).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashDataWithholdingPenalty),
  },
  slashDataWithholdingToleranceSlots: {
    env: 'SLASH_DATA_WITHHOLDING_TOLERANCE_SLOTS',
    description:
      'Number of full L2 slots that must elapse after a checkpoint slot before declaring its txs missing and slashing its attesters for data withholding.',
    ...numberConfigHelper(DefaultSlasherConfig.slashDataWithholdingToleranceSlots),
  },
  slashBroadcastedInvalidBlockPenalty: {
    env: 'SLASH_INVALID_BLOCK_PENALTY',
    description: 'Penalty amount for slashing a validator for an invalid block proposed via p2p.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashBroadcastedInvalidBlockPenalty),
  },
  slashBroadcastedInvalidCheckpointProposalPenalty: {
    env: 'SLASH_INVALID_CHECKPOINT_PROPOSAL_PENALTY',
    description: 'Penalty amount for slashing a validator for an invalid checkpoint proposal proposed via p2p.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashBroadcastedInvalidCheckpointProposalPenalty),
  },
  slashDuplicateProposalPenalty: {
    env: 'SLASH_DUPLICATE_PROPOSAL_PENALTY',
    description: 'Penalty amount for slashing a validator for sending duplicate proposals.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashDuplicateProposalPenalty),
  },
  slashDuplicateAttestationPenalty: {
    env: 'SLASH_DUPLICATE_ATTESTATION_PENALTY',
    description:
      'Penalty amount for slashing a validator for signing attestations for different proposals at the same slot.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashDuplicateAttestationPenalty),
  },
  slashInactivityTargetPercentage: {
    env: 'SLASH_INACTIVITY_TARGET_PERCENTAGE',
    description:
      'Missed attestation percentage to trigger creation of inactivity slash payload (0, 1]. Must be greater than 0',
    ...floatConfigHelper(DefaultSlasherConfig.slashInactivityTargetPercentage, v => {
      if (v <= 0 || v > 1) {
        throw new RangeError(`SLASH_INACTIVITY_TARGET_PERCENTAGE out of range. Expected (0, 1] got ${v}`);
      }
    }),
  },
  slashInactivityConsecutiveEpochThreshold: {
    env: 'SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD',
    description: 'Number of consecutive epochs a validator must be inactive before slashing (minimum 1).',
    ...numberConfigHelper(DefaultSlasherConfig.slashInactivityConsecutiveEpochThreshold),
    parseEnv: (val: string) => {
      const parsed = parseInt(val, 10);
      if (parsed < 1) {
        throw new RangeError(`SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD must be at least 1 (got ${parsed})`);
      }
      return parsed;
    },
  },
  slashInactivityPenalty: {
    env: 'SLASH_INACTIVITY_PENALTY',
    description: 'Penalty for an inactive validator (0 records offenses without slash votes).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashInactivityPenalty),
  },
  slashProposeInvalidAttestationsPenalty: {
    env: 'SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY',
    description: 'Penalty for proposing invalid attestations (0 records offenses without slash votes).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashProposeInvalidAttestationsPenalty),
  },
  slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty: {
    env: 'SLASH_PROPOSE_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS_PENALTY',
    description:
      'Penalty for publishing a checkpoint building on an invalid checkpoint (0 records offenses without slash votes).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty),
  },
  slashAttestInvalidCheckpointProposalPenalty: {
    env: 'SLASH_ATTEST_INVALID_CHECKPOINT_PROPOSAL_PENALTY',
    description: 'Penalty for attesting to an invalid checkpoint proposal (0 records offenses without slash votes).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashAttestInvalidCheckpointProposalPenalty),
  },
  slashUnknownPenalty: {
    env: 'SLASH_UNKNOWN_PENALTY',
    description: 'Penalty for an unknown offense (0 records offenses without slash votes).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashUnknownPenalty),
  },
  slashOffenseExpirationRounds: {
    env: 'SLASH_OFFENSE_EXPIRATION_ROUNDS',
    description: 'Number of rounds after which pending offenses expire.',
    ...numberConfigHelper(DefaultSlasherConfig.slashOffenseExpirationRounds),
  },
  slashMaxPayloadSize: {
    env: 'SLASH_MAX_PAYLOAD_SIZE',
    description: 'Maximum number of offenses to include in a single slash payload.',
    ...numberConfigHelper(DefaultSlasherConfig.slashMaxPayloadSize),
  },
  slashGracePeriodL2Slots: {
    description:
      'Number of L2 slots after the network upgrade during which slashing offenses are ignored. The upgrade time is determined from the CanonicalRollupUpdated event.',
    env: 'SLASH_GRACE_PERIOD_L2_SLOTS',
    ...numberConfigHelper(DefaultSlasherConfig.slashGracePeriodL2Slots),
  },
  slashExecuteRoundsLookBack: {
    env: 'SLASH_EXECUTE_ROUNDS_LOOK_BACK',
    description: 'How many rounds to look back when searching for a round to execute.',
    ...numberConfigHelper(DefaultSlasherConfig.slashExecuteRoundsLookBack),
  },
  slashSelfAllowed: {
    description: 'Whether to allow slashes to own validators',
    ...booleanConfigHelper(DefaultSlasherConfig.slashSelfAllowed),
  },
};
