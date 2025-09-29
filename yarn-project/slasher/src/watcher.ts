import { EthAddress } from '@aztec/foundation/eth-address';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import { OffenseType } from '@aztec/stdlib/slashing';

import type { SlasherConfig } from './config.js';

export const WANT_TO_SLASH_EVENT = 'want-to-slash' as const;

export interface WantToSlashArgs {
  validator: EthAddress;
  amount: bigint;
  offenseType: OffenseType;
  epochOrSlot: bigint; // Epoch number for epoch-based offenses, block number for block-based
}

// Event map for specific, known events of a watcher
export interface WatcherEventMap {
  [WANT_TO_SLASH_EVENT]: (args: WantToSlashArgs[]) => void;
}

export type WatcherEmitter = TypedEventEmitter<WatcherEventMap>;

export type Watcher = WatcherEmitter & {
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  updateConfig: (config: Partial<SlasherConfig>) => void;
};
