import type { ConfigMappingsType } from '@aztec/foundation/config';
import { bigintConfigHelper, floatConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';

export type { SlasherConfig };

export const DefaultSlasherConfig: SlasherConfig = {
  slashPayloadTtlSeconds: 60 * 60 * 24, // 1 day
  slashOverridePayload: undefined,
  slashMinPenaltyPercentage: 0.5, // 50% of penalty
  slashMaxPenaltyPercentage: 2.0, //2x of penalty
  slashValidatorsAlways: '', // Empty by default
  slashValidatorsNever: '', // Empty by default
  slashPrunePenalty: 1n,
  slashInactivityTargetPercentage: 0.9,
  slashBroadcastedInvalidBlockPenalty: 1n,
  slashInactivityPenalty: 1n,
  slashProposeInvalidAttestationsPenalty: 1n,
  slashAttestDescendantOfInvalidPenalty: 1n,
  slashUnknownPenalty: 1n,
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
  slashMinPenaltyPercentage: {
    env: 'SLASH_MIN_PENALTY_PERCENTAGE',
    description: 'Minimum penalty percentage for slashing offenses (0.1 is 10%).',
    ...floatConfigHelper(DefaultSlasherConfig.slashMinPenaltyPercentage),
  },
  slashMaxPenaltyPercentage: {
    env: 'SLASH_MAX_PENALTY_PERCENTAGE',
    description: 'Maximum penalty percentage for slashing offenses (2.0 is 200%).',
    ...floatConfigHelper(DefaultSlasherConfig.slashMaxPenaltyPercentage),
  },
  slashValidatorsAlways: {
    env: 'SLASH_VALIDATORS_ALWAYS',
    description: 'Comma-separated list of validator addresses that should always be slashed.',
    parseEnv: (val: string) => val || '',
    defaultValue: DefaultSlasherConfig.slashValidatorsAlways,
  },
  slashValidatorsNever: {
    env: 'SLASH_VALIDATORS_NEVER',
    description: 'Comma-separated list of validator addresses that should never be slashed.',
    parseEnv: (val: string) => val || '',
    defaultValue: DefaultSlasherConfig.slashValidatorsNever,
  },
  slashPrunePenalty: {
    env: 'SLASH_PRUNE_PENALTY',
    description: 'Penalty amount for slashing validators of a pruned epoch (set to 0 to disable).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashPrunePenalty),
  },
  slashBroadcastedInvalidBlockPenalty: {
    env: 'SLASH_INVALID_BLOCK_PENALTY',
    description: 'Penalty amount for slashing a validator for an invalid block.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashBroadcastedInvalidBlockPenalty),
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
  slashInactivityPenalty: {
    env: 'SLASH_INACTIVITY_PENALTY',
    description: 'Penalty amount for slashing an inactive validator (set to 0 to disable).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashInactivityPenalty),
  },
  slashProposeInvalidAttestationsPenalty: {
    env: 'SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY',
    description: 'Penalty amount for slashing a proposer that proposed invalid attestations (set to 0 to disable).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashProposeInvalidAttestationsPenalty),
  },
  slashAttestDescendantOfInvalidPenalty: {
    env: 'SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY',
    description:
      'Penalty amount for slashing a validator that attested to a descendant of an invalid block (set to 0 to disable).',
    ...bigintConfigHelper(DefaultSlasherConfig.slashAttestDescendantOfInvalidPenalty),
  },
  slashUnknownPenalty: {
    env: 'SLASH_UNKNOWN_PENALTY',
    description: 'Penalty amount for slashing a validator for an unknown offense (set to 0 to disable).',
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
    description: 'Number of L2 slots to wait before considering a slashing offense expired.',
    env: 'SLASH_GRACE_PERIOD_L2_SLOTS',
    ...numberConfigHelper(DefaultSlasherConfig.slashGracePeriodL2Slots),
  },
};
