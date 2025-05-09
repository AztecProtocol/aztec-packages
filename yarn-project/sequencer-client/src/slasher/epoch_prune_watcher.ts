import { EpochCache } from '@aztec/epoch-cache';
import { createLogger } from '@aztec/foundation/log';
import { type L2BlockSourceEvent, type L2BlockSourceEventEmitter, L2BlockSourceEvents } from '@aztec/stdlib/block';
import { type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';

import EventEmitter from 'node:events';

import { Offence, WANT_TO_SLASH_EVENT } from './config.js';

export class EpochPruneWatcher extends EventEmitter {
  private log = createLogger('epoch-prune-watcher');

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private l1constants: L1RollupConstants,
    private epochCache: EpochCache,
    private penalty: bigint,
  ) {
    super();
    this.log.info('EpochPruneWatcher initialized');
  }

  public start() {
    this.l2BlockSource.on(L2BlockSourceEvents.L2PruneDetected, this.handlePruneL2Blocks.bind(this));
  }

  public stop() {
    this.l2BlockSource.removeListener(L2BlockSourceEvents.L2PruneDetected, this.handlePruneL2Blocks.bind(this));
  }

  private handlePruneL2Blocks(event: L2BlockSourceEvent): void {
    const { /*_slotNumber,*/ epochNumber } = event; // L2 slotNumber might be used for timing
    this.log.info(`Detected chain prune. Attempting to create slash for epoch ${epochNumber}`, event);

    // get the validators for the epoch
    this.getValidatorsForEpoch(epochNumber)
      .then(validators => {
        const args = this.validatorsToSlashingArgs(validators);
        if (args) {
          this.emit(WANT_TO_SLASH_EVENT, args);
        }
      })
      .catch(error => {
        this.log.error('Error getting validators for epoch', error);
      });
  }

  private async getValidatorsForEpoch(epochNumber: bigint): Promise<`0x${string}`[]> {
    const [startSlot] = getSlotRangeForEpoch(epochNumber, this.l1constants);
    const { committee } = await this.epochCache.getCommittee(startSlot);
    return committee.map(v => v.toString());
  }

  private validatorsToSlashingArgs(validators: `0x${string}`[]):
    | {
        validators: `0x${string}`[];
        amounts: bigint[];
        offenses: Offence[];
      }
    | undefined {
    if (validators.length === 0) {
      this.log.debug('No validators found for epoch, skipping slash creation.');
      return undefined;
    }

    const amounts = Array(validators.length).fill(this.penalty);
    const offenses = Array(validators.length).fill(Offence.EPOCH_PRUNE);
    return { validators, amounts, offenses };
  }
}
