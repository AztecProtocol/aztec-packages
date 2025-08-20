import type { ConfigMappingsType } from '@aztec/foundation/config';
import {
  bigintConfigHelper,
  booleanConfigHelper,
  floatConfigHelper,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';

export type { SlasherConfig };

export const DefaultSlasherConfig: SlasherConfig = {
  slashPayloadTtlSeconds: 60 * 60 * 24, // 1 day
  slashOverridePayload: undefined,
  slashPruneEnabled: true,
  slashPrunePenalty: 1n,
  slashPruneMaxPenalty: 100n,
  slashBroadcastedInvalidBlockEnabled: true,
  slashBroadcastedInvalidBlockPenalty: 1n,
  slashBroadcastedInvalidBlockMaxPenalty: 100n,
  slashInactivityEnabled: true,
  slashInactivityCreateTargetPercentage: 0.9,
  slashInactivitySignalTargetPercentage: 0.6,
  slashInactivityCreatePenalty: 1n,
  slashInactivityMaxPenalty: 100n,
  slashProposeInvalidAttestationsPenalty: 1n,
  slashProposeInvalidAttestationsMaxPenalty: 100n,
  slashAttestDescendantOfInvalidPenalty: 1n,
  slashAttestDescendantOfInvalidMaxPenalty: 100n,
  slashUnknownPenalty: 1n,
  slashUnknownMaxPenalty: 100n,
  slashProposerRoundPollingIntervalSeconds: 12,
  slashOffenseExpirationRounds: 4,
  slashMaxPayloadSize: 50,
  slashGracePeriodL2Slots: 0,
};

export const slasherConfigMappings: ConfigMappingsType<SlasherConfig> = {
  slashPayloadTtlSeconds: {
    env: 'SLASH_PAYLOAD_TTL_SECONDS',
    description: 'Time-to-live for slash payloads in seconds.',
    ...numberConfigHelper(DefaultSlasherConfig.slashPayloadTtlSeconds),
  },
  slashOverridePayload: {
    env: 'SLASH_OVERRIDE_PAYLOAD',
    description: 'An Ethereum address for a slash payload to vote for unconditionally.',
    parseEnv: (val: string) => (val ? EthAddress.fromString(val) : undefined),
    defaultValue: DefaultSlasherConfig.slashOverridePayload,
  },
  slashPruneEnabled: {
    env: 'SLASH_PRUNE_ENABLED',
    description: 'Enable creation of slash payloads for pruned epochs.',
    ...booleanConfigHelper(DefaultSlasherConfig.slashPruneEnabled),
  },
  slashPrunePenalty: {
    env: 'SLASH_PRUNE_PENALTY',
    description: 'Penalty amount for slashing validators of a pruned epoch.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashPrunePenalty),
  },
  slashPruneMaxPenalty: {
    env: 'SLASH_PRUNE_MAX_PENALTY',
    description: 'Maximum penalty amount for slashing validators of a pruned epoch.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashPruneMaxPenalty),
  },
  slashBroadcastedInvalidBlockEnabled: {
    env: 'SLASH_INVALID_BLOCK_ENABLED',
    description: 'Enable creation of slash payloads for invalid blocks.',
    ...booleanConfigHelper(DefaultSlasherConfig.slashBroadcastedInvalidBlockEnabled),
  },
  slashBroadcastedInvalidBlockPenalty: {
    env: 'SLASH_INVALID_BLOCK_PENALTY',
    description: 'Penalty amount for slashing a validator for an invalid block.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashBroadcastedInvalidBlockPenalty),
  },
  slashBroadcastedInvalidBlockMaxPenalty: {
    env: 'SLASH_INVALID_BLOCK_MAX_PENALTY',
    description: 'Maximum penalty amount for slashing a validator for an invalid block.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashBroadcastedInvalidBlockMaxPenalty),
  },
  slashInactivityEnabled: {
    env: 'SLASH_INACTIVITY_ENABLED',
    description: 'Enable creation of inactivity slash payloads.',
    ...booleanConfigHelper(DefaultSlasherConfig.slashInactivityEnabled),
  },
  slashInactivityCreateTargetPercentage: {
    env: 'SLASH_INACTIVITY_CREATE_TARGET_PERCENTAGE',
    description:
      'Missed attestation percentage to trigger creation of inactivity slash payload (0, 1]. Must be greater than 0',
    ...floatConfigHelper(DefaultSlasherConfig.slashInactivityCreateTargetPercentage, v => {
      if (v <= 0 || v > 1) {
        throw new RangeError(`SLASH_INACTIVITY_CREATE_TARGET_PERCENTAGE out of range. Expected (0, 1] got ${v}`);
      }
    }),
  },
  slashInactivitySignalTargetPercentage: {
    env: 'SLASH_INACTIVITY_SIGNAL_TARGET_PERCENTAGE',
    description:
      'Missed attestation percentage to trigger voting for an inactivity slash payload (0, 1]. Must be greater than 0',
    ...floatConfigHelper(DefaultSlasherConfig.slashInactivitySignalTargetPercentage, v => {
      if (v <= 0 || v > 1) {
        throw new RangeError(`SLASH_INACTIVITY_SIGNAL_TARGET_PERCENTAGE out of range. Expected (0, 1] got ${v}`);
      }
    }),
  },
  slashInactivityCreatePenalty: {
    env: 'SLASH_INACTIVITY_CREATE_PENALTY',
    description: 'Penalty amount for slashing an inactive validator.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashInactivityCreatePenalty),
  },
  slashInactivityMaxPenalty: {
    env: 'SLASH_INACTIVITY_MAX_PENALTY',
    description: 'Maximum penalty amount for slashing an inactive validator.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashInactivityMaxPenalty),
  },
  slashProposeInvalidAttestationsPenalty: {
    env: 'SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY',
    description: 'Penalty amount for slashing a proposer that proposed invalid attestations.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashProposeInvalidAttestationsPenalty),
  },
  slashProposeInvalidAttestationsMaxPenalty: {
    env: 'SLASH_PROPOSE_INVALID_ATTESTATIONS_MAX_PENALTY',
    description: 'Maximum penalty amount for slashing a proposer that proposed invalid attestations.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashProposeInvalidAttestationsMaxPenalty),
  },
  slashAttestDescendantOfInvalidPenalty: {
    env: 'SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY',
    description: 'Penalty amount for slashing a validator that attested to a descendant of an invalid block.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashAttestDescendantOfInvalidPenalty),
  },
  slashAttestDescendantOfInvalidMaxPenalty: {
    env: 'SLASH_ATTEST_DESCENDANT_OF_INVALID_MAX_PENALTY',
    description: 'Maximum penalty amount for slashing a validator that attested to a descendant of an invalid block.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashAttestDescendantOfInvalidMaxPenalty),
  },
  slashUnknownPenalty: {
    env: 'SLASH_UNKNOWN_PENALTY',
    description: 'Penalty amount for slashing a validator for an unknown offense.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashUnknownPenalty),
  },
  slashUnknownMaxPenalty: {
    env: 'SLASH_UNKNOWN_MAX_PENALTY',
    description: 'Maximum penalty amount for slashing a validator for an unknown offense.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashUnknownMaxPenalty),
  },
  slashProposerRoundPollingIntervalSeconds: {
    description: 'Polling interval for slashing proposer round in seconds.',
    ...numberConfigHelper(DefaultSlasherConfig.slashProposerRoundPollingIntervalSeconds),
  },
  slashOffenseExpirationRounds: {
    description: 'Number of rounds after which pending offenses expire.',
    ...numberConfigHelper(DefaultSlasherConfig.slashOffenseExpirationRounds),
  },
  slashMaxPayloadSize: {
    description: 'Maximum number of offenses to include in a single slash payload.',
    ...numberConfigHelper(DefaultSlasherConfig.slashMaxPayloadSize),
  },
  slashGracePeriodL2Slots: {
    description: 'Number of L2 slots to wait before considering a slashing offense expired.',
    env: 'SLASH_GRACE_PERIOD_L2_SLOTS',
    ...numberConfigHelper(DefaultSlasherConfig.slashGracePeriodL2Slots),
  },
};
