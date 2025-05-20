import type { ConfigMappingsType } from '@aztec/foundation/config';
import { bigintConfigHelper, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { TypedEventEmitter } from '@aztec/foundation/types';

export enum Offence {
  UNKNOWN = 0,
  EPOCH_PRUNE = 1,
  INACTIVITY = 2,
}

export const OffenceToBigInt: Record<Offence, bigint> = {
  [Offence.UNKNOWN]: 0n,
  [Offence.EPOCH_PRUNE]: 1n,
  [Offence.INACTIVITY]: 2n,
};

export function bigIntToOffence(offense: bigint): Offence {
  switch (offense) {
    case 0n:
      return Offence.UNKNOWN;
    case 1n:
      return Offence.EPOCH_PRUNE;
    case 2n:
      return Offence.INACTIVITY;
    default:
      throw new Error(`Unknown offence: ${offense}`);
  }
}

export const WANT_TO_SLASH_EVENT = 'wantToSlash' as const;

export interface WantToSlashArgs {
  validators: `0x${string}`[] | readonly `0x${string}`[];
  amounts: bigint[];
  offenses: Offence[];
}

// Event map for specific, known events of a watcher
export interface WatcherEventMap {
  [WANT_TO_SLASH_EVENT]: (args: WantToSlashArgs) => void;
}

export type WatcherEmitter = TypedEventEmitter<WatcherEventMap>;

export type CheckSlashFn = (validator: `0x${string}`, amount: bigint, offense: Offence) => Promise<boolean>;

export type Watcher = WatcherEmitter & {
  shouldSlash: CheckSlashFn;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
};

export interface SlasherConfig {
  // New configurations based on design doc
  slashOverridePayload?: EthAddress;
  slashPayloadTtlSeconds: number; // TTL for payloads, in seconds
  slashPruneCreate: boolean;
  slashPrunePenalty: bigint;
  slashPruneSignal: boolean;
  slashInactivityCreateTargetPercentage: number; // 0-1, 0.9 means 90%
  slashInactivityCreatePenalty: bigint;
  slashInactivitySignalTargetPercentage: number; // 0-1, 0.6 means 60%
  slashProposerRoundPollingIntervalSeconds: number;
  // Consider adding: slashInactivityCreateEnabled: boolean;
}

export const DefaultSlasherConfig: SlasherConfig = {
  slashInactivityCreatePenalty: 1n,
  slashInactivityCreateTargetPercentage: 0.9,
  slashInactivitySignalTargetPercentage: 0.6,
  slashPayloadTtlSeconds: 60 * 60 * 24, // 1 day
  slashPruneCreate: false,
  slashPrunePenalty: 1n,
  slashPruneSignal: true,
  slashOverridePayload: undefined,
  slashProposerRoundPollingIntervalSeconds: 12,
};

export const slasherConfigMappings: ConfigMappingsType<SlasherConfig> = {
  slashOverridePayload: {
    description: 'An Ethereum address for a slash payload to vote for unconditionally.',
    parseEnv: (val: string) => (val ? EthAddress.fromString(val) : undefined),
    defaultValue: DefaultSlasherConfig.slashOverridePayload,
  },
  slashPayloadTtlSeconds: {
    description: 'Time-to-live for slash payloads in seconds.',
    ...numberConfigHelper(DefaultSlasherConfig.slashPayloadTtlSeconds),
  },
  slashPruneCreate: {
    description: 'Enable creation of slash payloads for pruned epochs.',
    ...booleanConfigHelper(DefaultSlasherConfig.slashPruneCreate),
  },
  slashPrunePenalty: {
    description: 'Penalty amount for slashing validators of a pruned epoch.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashPrunePenalty),
  },
  slashPruneSignal: {
    description: 'Enable voting for slash payloads for pruned epochs.',
    ...booleanConfigHelper(DefaultSlasherConfig.slashPruneSignal),
  },
  slashInactivityCreateTargetPercentage: {
    description: 'Missed attestation percentage to trigger creation of inactivity slash payload (0-100).',
    ...numberConfigHelper(DefaultSlasherConfig.slashInactivityCreateTargetPercentage),
  },
  slashInactivityCreatePenalty: {
    description: 'Penalty amount for slashing an inactive validator.',
    ...bigintConfigHelper(DefaultSlasherConfig.slashInactivityCreatePenalty),
  },
  slashInactivitySignalTargetPercentage: {
    description: 'Missed attestation percentage to trigger voting for an inactivity slash payload (0-100).',
    ...numberConfigHelper(DefaultSlasherConfig.slashInactivitySignalTargetPercentage),
  },
  slashProposerRoundPollingIntervalSeconds: {
    description: 'Polling interval for slashing proposer round in seconds.',
    ...numberConfigHelper(DefaultSlasherConfig.slashProposerRoundPollingIntervalSeconds),
  },
};
