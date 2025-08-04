import { NULL_KEY } from '@aztec/ethereum';
import type { ConfigMappingsType } from '@aztec/foundation/config';
import {
  SecretValue,
  bigintConfigHelper,
  booleanConfigHelper,
  floatConfigHelper,
  numberConfigHelper,
  secretValueConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { Offense } from '@aztec/stdlib/slashing';

export type { SlasherConfig };

export const WANT_TO_SLASH_EVENT = 'wantToSlash' as const;

export interface WantToSlashArgs {
  validator: EthAddress;
  amount: bigint;
  offense: Offense;
}

// Event map for specific, known events of a watcher
export interface WatcherEventMap {
  [WANT_TO_SLASH_EVENT]: (args: WantToSlashArgs[]) => void;
}

export type WatcherEmitter = TypedEventEmitter<WatcherEventMap>;

export type CheckSlashFn = (args: WantToSlashArgs) => Promise<boolean>;

export type Watcher = WatcherEmitter & {
  shouldSlash: CheckSlashFn;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
};

export const DefaultSlasherConfig: SlasherConfig = {
  slashPayloadTtlSeconds: 60 * 60 * 24, // 1 day
  slashOverridePayload: undefined,
  slashPruneEnabled: true,
  slashPrunePenalty: 1n,
  slashPruneMaxPenalty: 100n,
  slashInvalidBlockEnabled: true,
  slashInvalidBlockPenalty: 1n,
  slashInvalidBlockMaxPenalty: 100n,
  slashInactivityEnabled: true,
  slashInactivityCreateTargetPercentage: 0.9,
  slashInactivitySignalTargetPercentage: 0.6,
  slashInactivityCreatePenalty: 1n,
  slashInactivityMaxPenalty: 100n,
  slashProposeInvalidAttestationsPenalty: 1n,
  slashProposeInvalidAttestationsMaxPenalty: 100n,
  slashAttestDescendantOfInvalidPenalty: 1n,
  slashAttestDescendantOfInvalidMaxPenalty: 100n,
  slashProposerRoundPollingIntervalSeconds: 12,
  slasherPrivateKey: new SecretValue<string | undefined>(undefined),
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
  slashInvalidBlockEnabled: {
    env: 'SLASH_INVALID_BLOCK_ENABLED',
    description: 'Enable creation of slash payloads for invalid blocks.',
    ...booleanConfigHelper(DefaultSlasherConfig.slashInvalidBlockEnabled),
  },
  slashInvalidBlockPenalty: {
    env: 'SLASH_INVALID_BLOCK_PENALTY',
    description: 'Penalty amount for slashing a validator for an invalid block.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashInvalidBlockPenalty),
  },
  slashInvalidBlockMaxPenalty: {
    env: 'SLASH_INVALID_BLOCK_MAX_PENALTY',
    description: 'Maximum penalty amount for slashing a validator for an invalid block.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashInvalidBlockMaxPenalty),
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
  slashProposerRoundPollingIntervalSeconds: {
    description: 'Polling interval for slashing proposer round in seconds.',
    ...numberConfigHelper(DefaultSlasherConfig.slashProposerRoundPollingIntervalSeconds),
  },
  slasherPrivateKey: {
    description: 'Private key used for creating slash payloads.',
    ...secretValueConfigHelper(val => (val ? `0x${val.replace('0x', '')}` : NULL_KEY)),
  },
};
