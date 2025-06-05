import { EpochCache } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  EthAddress,
  type L2BlockSourceEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
} from '@aztec/stdlib/block';

import EventEmitter from 'node:events';
import type { Hex } from 'viem';

import { Offense, WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from './config.js';

export class EpochPruneWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private log: Logger = createLogger('epoch-prune-watcher');

  // Keep track of pruned epochs we've seen to their committee
  private prunedEpochs: Map<bigint, `0x${string}`[]> = new Map();
  // Only keep track of the last N pruned epochs
  private maxPrunedEpochs = 100;

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private epochCache: EpochCache,
    private penalty: bigint,
    private maxPenalty: bigint,
  ) {
    super();
    this.log.info('EpochPruneWatcher initialized');
  }

  public start() {
    this.l2BlockSource.on(L2BlockSourceEvents.L2PruneDetected, this.handlePruneL2Blocks.bind(this));
    return Promise.resolve();
  }

  public stop() {
    this.l2BlockSource.removeListener(L2BlockSourceEvents.L2PruneDetected, this.handlePruneL2Blocks.bind(this));
    return Promise.resolve();
  }

  // TODO(#14407), TODO(#14408)
  // We should only be slashing due to prune if:
  // - the data was not available (#14407)
  // - OR the data was available and the epoch could have been proven (#14408)
  private handlePruneL2Blocks(event: L2BlockSourceEvent): void {
    const { epochNumber } = event;
    this.log.info(`Detected chain prune. Attempting to create slash for epoch ${epochNumber}`, event);

    this.getValidatorsForEpoch(epochNumber)
      .then(validators => {
        const args = this.validatorsToSlashingArgs(validators);

        if (args) {
          this.addToPrunedEpochs(epochNumber, validators);
          this.emit(WANT_TO_SLASH_EVENT, args);
        }
      })
      .catch(error => {
        this.log.error('Error getting validators for epoch', error);
      });
  }

  private addToPrunedEpochs(epochNumber: bigint, validators: Hex[]) {
    this.prunedEpochs.set(epochNumber, validators);
    if (this.prunedEpochs.size > this.maxPrunedEpochs) {
      this.prunedEpochs.delete(this.prunedEpochs.keys().next().value!);
    }
  }

  private async getValidatorsForEpoch(epochNumber: bigint): Promise<`0x${string}`[]> {
    const { committee } = await this.epochCache.getCommitteeForEpoch(epochNumber);
    return committee.map(v => v.toString());
  }

  private validatorsToSlashingArgs(validators: `0x${string}`[]): WantToSlashArgs[] | undefined {
    if (validators.length === 0) {
      this.log.debug('No validators found for epoch, skipping slash creation.');
      return undefined;
    }
    return validators.map(v => ({
      validator: EthAddress.fromString(v),
      amount: this.penalty,
      offense: Offense.EPOCH_PRUNE,
    }));
  }

  private wantToSlashForEpoch(validator: `0x${string}`, _amount: bigint, epochNumber: bigint): boolean {
    return this.prunedEpochs.get(epochNumber)?.includes(validator) ?? false;
  }

  public shouldSlash({ validator, amount }: WantToSlashArgs): Promise<boolean> {
    for (const epoch of this.prunedEpochs.keys()) {
      if (this.wantToSlashForEpoch(validator.toString(), amount, epoch) && amount <= this.maxPenalty) {
        return Promise.resolve(true);
      }
    }

    return Promise.resolve(false);
  }
}
