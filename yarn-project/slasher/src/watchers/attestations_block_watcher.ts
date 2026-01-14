import { EpochCache } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type InvalidCheckpointDetectedEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type ValidateCheckpointNegativeResult,
} from '@aztec/stdlib/block';
import type { CheckpointInfo } from '@aztec/stdlib/checkpoint';
import { OffenseType } from '@aztec/stdlib/slashing';

import EventEmitter from 'node:events';

import type { SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const AttestationsBlockWatcherConfigKeys = [
  'slashAttestDescendantOfInvalidPenalty',
  'slashProposeInvalidAttestationsPenalty',
] as const;

type AttestationsBlockWatcherConfig = Pick<SlasherConfig, (typeof AttestationsBlockWatcherConfigKeys)[number]>;

/**
 * This watcher is responsible for detecting invalid blocks and creating slashing arguments for offenders.
 * An invalid block is one that doesn't have enough attestations or has incorrect attestations.
 * The proposer of an invalid block should be slashed.
 * If there's another block consecutive to the invalid one, its proposer and attestors should also be slashed.
 */
export class AttestationsBlockWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private log: Logger = createLogger('attestations-block-watcher');

  // Only keep track of the last N invalid checkpoints
  private maxInvalidCheckpoints = 100;

  // All invalid archive roots seen
  private invalidArchiveRoots: Set<string> = new Set();

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

  private handleInvalidCheckpoint(event: InvalidCheckpointDetectedEvent): void {
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

    // Store the invalid checkpoint
    this.addInvalidCheckpoint(event.validationResult.checkpoint);

    // Slash the proposer of the invalid checkpoint
    this.slashProposer(event.validationResult);

    // Check if the parent of this checkpoint is invalid as well, if so, we will slash its attestors as well
    this.slashAttestorsOnAncestorInvalid(event.validationResult);
  }

  private slashAttestorsOnAncestorInvalid(validationResult: ValidateCheckpointNegativeResult) {
    const checkpoint = validationResult.checkpoint;

    const parentArchive = checkpoint.lastArchive.toString();
    if (this.invalidArchiveRoots.has(parentArchive)) {
      const attestors = validationResult.attestors;
      this.log.info(
        `Want to slash attestors of checkpoint ${checkpoint.checkpointNumber} built on invalid checkpoint`,
        {
          ...checkpoint,
          ...attestors,
          parentArchive,
        },
      );

      this.emit(
        WANT_TO_SLASH_EVENT,
        attestors.map(attestor => ({
          validator: attestor,
          amount: this.config.slashAttestDescendantOfInvalidPenalty,
          offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
          epochOrSlot: BigInt(SlotNumber(checkpoint.slotNumber)),
        })),
      );
    }
  }

  private slashProposer(validationResult: ValidateCheckpointNegativeResult) {
    const { reason, checkpoint } = validationResult;
    const checkpointNumber = checkpoint.checkpointNumber;
    const slot = checkpoint.slotNumber;
    const epochCommitteeInfo = {
      committee: validationResult.committee,
      seed: validationResult.seed,
      epoch: validationResult.epoch,
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

  private addInvalidCheckpoint(checkpoint: CheckpointInfo) {
    this.invalidArchiveRoots.add(checkpoint.archive.toString());

    // Prune old entries if we exceed the maximum
    if (this.invalidArchiveRoots.size > this.maxInvalidCheckpoints) {
      const oldestKey = this.invalidArchiveRoots.keys().next().value!;
      this.invalidArchiveRoots.delete(oldestKey);
    }
  }
}
