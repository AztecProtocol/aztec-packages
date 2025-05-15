import { type Logger, createLogger } from '@aztec/foundation/log';
import type { L2BlockSourceEventEmitter } from '@aztec/stdlib/block';

import { EventEmitter } from 'node:events';

import type { Sentinel } from '../sentinel/sentinel.js';
import type { WatcherEmitter } from './config.js';

export class InactivityWatcher extends (EventEmitter as new () => WatcherEmitter) {
  private log: Logger = createLogger('inactivity-watcher');

  private inactivityCreateTargetPercentage: number;
  private inactivityCreatePenalty: bigint;
  private inactivitySignalTargetPercentage: number;
  private epochDuration: number;
  private epochCriminals: Map<number, `0x${string}`[]>;

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private sentinel: Sentinel,

    config: {
      epochDuration: number;
      inactivityCreateTargetPercentage: number;
      inactivityCreatePenalty: bigint;
      inactivitySignalTargetPercentage: number;
    },
  ) {
    super();
    this.inactivityCreateTargetPercentage = config.inactivityCreateTargetPercentage;
    this.inactivityCreatePenalty = config.inactivityCreatePenalty;
    this.inactivitySignalTargetPercentage = config.inactivitySignalTargetPercentage;
    this.epochDuration = config.epochDuration;
    this.epochCriminals = new Map();
  }

  public handleProvenPerformance(epoch: bigint, performance: Record<`0x${string}`, { missed: number; total: number }>) {
    const epochNumber = Number(epoch);
    const criminals = Object.entries(performance)
      .filter(([_, { missed, total }]) => {
        return missed / total > this.inactivityCreateTargetPercentage;
      })
      .map(([address]) => address as `0x${string}`);

    this.epochCriminals.set(epochNumber, criminals);
  }

  public wantToSlash(_validators: `0x${string}`[], _amounts: bigint[]): boolean {
    // need to walk back the epochs to see if there is one in which all the validators have exceeded the inactivity signal target
    return false;
  }
}
