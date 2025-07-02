import type { ConfigMappingsType } from '@aztec/foundation/config';
import { bigintConfigHelper, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { TypedEventEmitter } from '@aztec/foundation/types';

export enum Offense {
  UNKNOWN = 0,
  DATA_WITHHOLDING = 1,
  VALID_EPOCH_PRUNED = 2,
  INACTIVITY = 3,
  INVALID_BLOCK = 4,
}

export const OffenseToBigInt: Record<Offense, bigint> = {
  [Offense.UNKNOWN]: 0n,
  [Offense.DATA_WITHHOLDING]: 1n,
  [Offense.VALID_EPOCH_PRUNED]: 2n,
  [Offense.INACTIVITY]: 3n,
  [Offense.INVALID_BLOCK]: 4n,
};

export function bigIntToOffense(offense: bigint): Offense {
  switch (offense) {
    case 0n:
      return Offense.UNKNOWN;
    case 1n:
      return Offense.DATA_WITHHOLDING;
    case 2n:
      return Offense.VALID_EPOCH_PRUNED;
    case 3n:
      return Offense.INACTIVITY;
    case 4n:
      return Offense.INVALID_BLOCK;
    default:
      throw new Error(`Unknown offense: ${offense}`);
  }
}

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

export interface SlasherConfig {
  // New configurations based on design doc
  slashOverridePayload?: EthAddress;
  slashPayloadTtlSeconds: number; // TTL for payloads, in seconds
  slashPruneEnabled: boolean;
  slashPrunePenalty: bigint;
  slashPruneMaxPenalty: bigint;
  slashInvalidBlockEnabled: boolean;
  slashInvalidBlockPenalty: bigint;
  slashInvalidBlockMaxPenalty: bigint;
  slashInactivityEnabled: boolean;
  slashInactivityCreateTargetPercentage: number; // 0-1, 0.9 means 90%
  slashInactivitySignalTargetPercentage: number; // 0-1, 0.6 means 60%
  slashInactivityCreatePenalty: bigint;
  slashInactivityMaxPenalty: bigint;
  slashProposerRoundPollingIntervalSeconds: number;
  // Consider adding: slashInactivityCreateEnabled: boolean;
}

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
  slashProposerRoundPollingIntervalSeconds: 12,
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
    description: 'Missed attestation percentage to trigger creation of inactivity slash payload (0-100).',
    ...numberConfigHelper(DefaultSlasherConfig.slashInactivityCreateTargetPercentage),
  },
  slashInactivitySignalTargetPercentage: {
    env: 'SLASH_INACTIVITY_SIGNAL_TARGET_PERCENTAGE',
    description: 'Missed attestation percentage to trigger voting for an inactivity slash payload (0-100).',
    ...numberConfigHelper(DefaultSlasherConfig.slashInactivitySignalTargetPercentage),
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
  slashProposerRoundPollingIntervalSeconds: {
    description: 'Polling interval for slashing proposer round in seconds.',
    ...numberConfigHelper(DefaultSlasherConfig.slashProposerRoundPollingIntervalSeconds),
  },
};
