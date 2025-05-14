import { type Logger, createLogger } from '@aztec/foundation/log';
import { type L2BlockSourceEvent, type L2BlockSourceEventEmitter, L2BlockSourceEvents } from '@aztec/stdlib/block';

import { EventEmitter } from 'node:events';

import type { WatcherEmitter } from './config.js';

export class InactivityWatcher extends (EventEmitter as new () => WatcherEmitter) {
  private log: Logger = createLogger('inactivity-watcher');

  private inactivityCreateTargetPercentage: number;
  private inactivityCreatePenalty: bigint;
  private inactivitySignalTargetPercentage: number;

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,

    config: {
      inactivityCreateTargetPercentage: number;
      inactivityCreatePenalty: bigint;
      inactivitySignalTargetPercentage: number;
    },
  ) {
    super();
    this.inactivityCreateTargetPercentage = config.inactivityCreateTargetPercentage;
    this.inactivityCreatePenalty = config.inactivityCreatePenalty;
    this.inactivitySignalTargetPercentage = config.inactivitySignalTargetPercentage;
  }

  public start() {
    this.l2BlockSource.on(L2BlockSourceEvents.L2BlockProven, this.handleL2BlockProven.bind(this));
  }

  public stop() {
    this.l2BlockSource.removeListener(L2BlockSourceEvents.L2BlockProven, this.handleL2BlockProven.bind(this));
  }

  private handleL2BlockProven(args: L2BlockSourceEvent) {
    this.log.info('L2 block proven', args);
  }
}
