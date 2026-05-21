import { EpochCache } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import { FifoSet } from '@aztec/foundation/fifo-set';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type InvalidCheckpointDetectedEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type ValidateCheckpointNegativeResult,
} from '@aztec/stdlib/block';
import { OffenseType } from '@aztec/stdlib/slashing';

import EventEmitter from 'node:events';

import type { SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const AttestationsBlockWatcherConfigKeys = [
  'slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty',
  'slashProposeInvalidAttestationsPenalty',
] as const;
const MAX_INVALID_CHECKPOINTS = 100;

type AttestationsBlockWatcherConfig = Pick<SlasherConfig, (typeof AttestationsBlockWatcherConfigKeys)[number]>;

/**
 * This watcher is responsible for detecting invalid checkpoints published to L1 and creating slashing arguments.
 * An invalid checkpoint is one that doesn't have enough attestations or has incorrect attestations.
 * The proposer of an invalid checkpoint is slashed for the bad attestations.
 * If a checkpoint published to L1 builds on an invalid checkpoint, its proposer is also slashed for
 * descending from invalid (attestors of the descendant are not slashed: under pipelining the next
 * proposer may have started building optimistically before the parent's invalidity was visible on L1).
 */
export class AttestationsBlockWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private log: Logger = createLogger('attestations-block-watcher');

  // Recently seen invalid archive roots.
  private invalidArchiveRoots = FifoSet.withLimit<string>(MAX_INVALID_CHECKPOINTS);

  private config: AttestationsBlockWatcherConfig;

  private boundHandleInvalidCheckpoint = (event: InvalidCheckpointDetectedEvent) => {
    try {
      this.handleInvalidCheckpoint(event);
    } catch (err) {
      this.log.error('Error handling invalid checkpoint', err, {
        ...event.validationResult,
        reason: event.validationResult.reason,
      });
    }
  };

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private epochCache: EpochCache,
    config: AttestationsBlockWatcherConfig,
  ) {
    super();
    this.config = pick(config, ...AttestationsBlockWatcherConfigKeys);
    this.log.info('AttestationsBlockWatcher initialized');
  }

  public updateConfig(newConfig: Partial<AttestationsBlockWatcherConfig>) {
    this.config = merge(this.config, pick(newConfig, ...AttestationsBlockWatcherConfigKeys));
    this.log.verbose('AttestationsBlockWatcher config updated', this.config);
  }

  public start() {
    this.l2BlockSource.events.on(
      L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
      this.boundHandleInvalidCheckpoint,
    );
    return Promise.resolve();
  }

  public stop() {
    this.l2BlockSource.events.removeListener(
      L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
      this.boundHandleInvalidCheckpoint,
    );
    return Promise.resolve();
  }

  /** Event handler for invalid checkpoints as reported by the archiver. Public for testing purposes. */
  public handleInvalidCheckpoint(event: InvalidCheckpointDetectedEvent): void {
    const { validationResult } = event;
    const checkpoint = validationResult.checkpoint;

    // Check if we already have processed this checkpoint, archiver may emit the same event multiple times
    if (this.invalidArchiveRoots.has(checkpoint.archive.toString())) {
      this.log.trace(`Already processed invalid checkpoint ${checkpoint.checkpointNumber}`);
      return;
    }

    this.log.verbose(`Detected invalid checkpoint ${checkpoint.checkpointNumber}`, {
      ...checkpoint,
      reason: validationResult.valid === false ? validationResult.reason : 'unknown',
    });

    this.invalidArchiveRoots.add(checkpoint.archive.toString());

    // Slash the proposer of the invalid checkpoint
    this.slashProposer(event.validationResult);

    // Check if the parent of this checkpoint is invalid as well, if so, we will slash its proposer for
    // publishing a descendant of an invalid checkpoint to L1.
    this.slashProposerOnAncestorInvalid(event.validationResult);
  }

  private slashProposerOnAncestorInvalid(validationResult: ValidateCheckpointNegativeResult) {
    const checkpoint = validationResult.checkpoint;

    const parentArchive = checkpoint.lastArchive.toString();
    if (!this.invalidArchiveRoots.has(parentArchive)) {
      return;
    }

    const epochCommitteeInfo = {
      committee: validationResult.committee,
      seed: validationResult.seed,
      epoch: validationResult.epoch,
      isEscapeHatchOpen: false,
    };
    const proposer = this.epochCache.getProposerFromEpochCommittee(epochCommitteeInfo, checkpoint.slotNumber);

    if (!proposer) {
      this.log.warn(
        `No proposer found for descendant checkpoint ${checkpoint.checkpointNumber} at slot ${checkpoint.slotNumber}`,
      );
      return;
    }

    const args: WantToSlashArgs = {
      validator: proposer,
      amount: this.config.slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty,
      offenseType: OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
      epochOrSlot: BigInt(SlotNumber(checkpoint.slotNumber)),
    };

    this.log.info(`Want to slash proposer of checkpoint ${checkpoint.checkpointNumber} built on invalid checkpoint`, {
      ...checkpoint,
      ...args,
      parentArchive,
    });

    this.emit(WANT_TO_SLASH_EVENT, [args]);
  }

  private slashProposer(validationResult: ValidateCheckpointNegativeResult) {
    const { reason, checkpoint } = validationResult;
    const checkpointNumber = checkpoint.checkpointNumber;
    const slot = checkpoint.slotNumber;
    const epochCommitteeInfo = {
      committee: validationResult.committee,
      seed: validationResult.seed,
      epoch: validationResult.epoch,
      isEscapeHatchOpen: false,
    };
    const proposer = this.epochCache.getProposerFromEpochCommittee(epochCommitteeInfo, slot);

    if (!proposer) {
      this.log.warn(`No proposer found for checkpoint ${checkpointNumber} at slot ${slot}`);
      return;
    }

    const offense = this.getOffenseFromInvalidationReason(reason);
    const amount = this.config.slashProposeInvalidAttestationsPenalty;
    const args: WantToSlashArgs = {
      validator: proposer,
      amount,
      offenseType: offense,
      epochOrSlot: BigInt(slot),
    };

    this.log.info(`Want to slash proposer of checkpoint ${checkpointNumber} due to ${reason}`, {
      ...checkpoint,
      ...args,
    });

    this.emit(WANT_TO_SLASH_EVENT, [args]);
  }

  private getOffenseFromInvalidationReason(reason: ValidateCheckpointNegativeResult['reason']): OffenseType {
    switch (reason) {
      case 'invalid-attestation':
        return OffenseType.PROPOSED_INCORRECT_ATTESTATIONS;
      case 'insufficient-attestations':
        return OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS;
      default: {
        const _: never = reason;
        return OffenseType.UNKNOWN;
      }
    }
  }
}
