import type { ConfigMappingsType } from '@aztec/foundation/config';
import { bigintConfigHelper, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

export enum Offence {
  UNKNOWN = 0,
  EPOCH_PRUNE = 1,
  INACTIVITY = 2,
}

export const WANT_TO_SLASH_EVENT = 'wantToSlash' as const;

export interface WantToSlashArgs {
  validators: `0x${string}`[];
  amounts: bigint[];
  offenses: Offence[];
}

// Event map for specific, known events of a watcher
export interface WatcherEventMap {
  [WANT_TO_SLASH_EVENT]: (args: WantToSlashArgs) => void;
}

// More flexible TypedEventEmitter definition
// It expects an object where keys are event names (string or symbol)
// and values are listener functions.
// See EpochPruneWatcher for an example of how to use this.
export interface TypedEventEmitter<TEventMap extends { [key in keyof TEventMap]: (...args: any[]) => void }> {
  on<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  off<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  emit<K extends keyof TEventMap>(event: K, ...args: Parameters<TEventMap[K]>): boolean;
  removeListener<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  // Can add other EventEmitter methods if needed, like once(), listenerCount(), etc.
}

export type WatcherEmitter = TypedEventEmitter<WatcherEventMap>;

export interface SlasherConfig {
  // New configurations based on design doc
  slashOverridePayload?: EthAddress;
  slashPayloadTtlSlots: number; // TTL for payloads, in L1 slots/blocks
  slashPruneCreate: boolean;
  slashPrunePenalty: bigint;
  slashPruneSignal: boolean;
  slashInactivityCreateTargetPercentage: number; // 0-100
  slashInactivityCreatePenalty: bigint;
  slashInactivitySignalTargetPercentage: number; // 0-100
  // Consider adding: slashInactivityCreateEnabled: boolean;
}

export const slasherConfigMappings: ConfigMappingsType<SlasherConfig> = {
  slashOverridePayload: {
    description: 'An Ethereum address for a slash payload to vote for unconditionally.',
    parseEnv: (val: string) => (val ? EthAddress.fromString(val) : undefined),
    defaultValue: undefined,
  },
  slashPayloadTtlSlots: {
    description: 'Time-to-live for slash payloads in L1 slots/blocks.',
    ...numberConfigHelper(0),
  },
  slashPruneCreate: {
    description: 'Enable creation of slash payloads for pruned epochs.',
    ...booleanConfigHelper(false),
  },
  slashPrunePenalty: {
    description: 'Penalty amount for slashing validators of a pruned epoch.',
    ...bigintConfigHelper(0n),
  },
  slashPruneSignal: {
    description: 'Enable voting for slash payloads for pruned epochs.',
    ...booleanConfigHelper(false),
  },
  slashInactivityCreateTargetPercentage: {
    description: 'Missed attestation percentage to trigger creation of inactivity slash payload (0-100).',
    ...numberConfigHelper(0),
  },
  slashInactivityCreatePenalty: {
    description: 'Penalty amount for slashing an inactive validator.',
    ...bigintConfigHelper(0n),
  },
  slashInactivitySignalTargetPercentage: {
    description: 'Missed attestation percentage to trigger voting for an inactivity slash payload (0-100).',
    ...numberConfigHelper(0),
  },
};
