import { EpochCache } from '@aztec/epoch-cache';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import {
  type DescendentOfInvalidAttestationsCheckpointEvent,
  type InvalidCheckpointDetectedEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type ValidateCheckpointNegativeResult,
} from '@aztec/stdlib/block';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { OffenseType, getOffenseTypeName } from '@aztec/stdlib/slashing';

import EventEmitter from 'node:events';

import type { SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const AttestationsBlockWatcherConfigKeys = [
  'slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty',
  'slashProposeInvalidAttestationsPenalty',
] as const;

type AttestationsBlockWatcherConfig = Pick<SlasherConfig, (typeof AttestationsBlockWatcherConfigKeys)[number]>;

/**
 * Watches the archiver for checkpoints whose publication is itself a slashable offense.
 *
 * Two cases are handled, both targeting the proposer of the offending checkpoint:
 *
 * - Invalid-attestations checkpoint: the proposer published a checkpoint to L1 whose
 *   attestations are either insufficient (below quorum) or incorrect (signature from a
 *   non-committee member, malformed signature, etc.). Slashed via
 *   {@link OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS} or
 *   {@link OffenseType.PROPOSED_INCORRECT_ATTESTATIONS}.
 *
 * - Descendant of an invalid checkpoint: the proposer published a checkpoint that extends a
 *   previously-rejected one. The descendant may itself have valid attestations, but it is still
 *   unusable. Triggered by the archiver's  `CheckpointBuiltOnInvalidAncestorDetected` event
 *   when the descendant has valid attestations (skipped before ingestion). Slashes the descendant's
 *   proposer via {@link OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS}.
 */
export class AttestationsBlockWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private log: Logger;
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

  private boundHandleDescendantOfInvalid = (event: DescendentOfInvalidAttestationsCheckpointEvent) => {
    this.handleDescendantOfInvalid(event).catch(err => {
      this.log.error('Error handling descendant of invalid checkpoint', err, {
        checkpointNumber: event.checkpoint.checkpointNumber,
        ancestorCheckpointNumber: event.ancestorCheckpointNumber,
      });
    });
  };

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private epochCache: EpochCache,
    config: AttestationsBlockWatcherConfig,
    bindings?: LoggerBindings,
  ) {
    super();
    this.log = createLogger('slasher:attestations-block-watcher', bindings);
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
    this.l2BlockSource.events.on(
      L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected,
      this.boundHandleDescendantOfInvalid,
    );
    return Promise.resolve();
  }

  public stop() {
    this.l2BlockSource.events.removeListener(
      L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
      this.boundHandleInvalidCheckpoint,
    );
    this.l2BlockSource.events.removeListener(
      L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected,
      this.boundHandleDescendantOfInvalid,
    );
    return Promise.resolve();
  }

  /** Event handler for invalid checkpoints as reported by the archiver. Public for testing purposes. */
  public handleInvalidCheckpoint(event: InvalidCheckpointDetectedEvent): void {
    const { validationResult } = event;
    const { reason, checkpoint } = validationResult;

    this.log.verbose(`Detected invalid checkpoint ${checkpoint.checkpointNumber}`, {
      ...checkpoint,
      reason: validationResult.valid === false ? validationResult.reason : 'unknown',
    });

    const { checkpointNumber, slotNumber: slot } = checkpoint;
    const epochCommitteeInfo = { ...validationResult, isEscapeHatchOpen: false };
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

    this.log.info(`Detected invalid attestations checkpoint proposer offense`, {
      ...checkpoint,
      reason,
      validator: args.validator.toString(),
      amount: args.amount,
      offenseType: getOffenseTypeName(args.offenseType),
      epochOrSlot: args.epochOrSlot,
    });

    this.emit(WANT_TO_SLASH_EVENT, [args]);
  }

  /**
   * Event handler for valid-attestations checkpoints that build on a previously-rejected ancestor.
   * The archiver emits this when ingesting the descendant, and we slash its proposer.
   */
  public async handleDescendantOfInvalid(event: DescendentOfInvalidAttestationsCheckpointEvent): Promise<void> {
    const { checkpoint, ancestorCheckpointNumber, ancestorArchiveRoot } = event;

    const slot = checkpoint.slotNumber;
    const epoch = EpochNumber(getEpochAtSlot(slot, this.epochCache.getL1Constants()));
    const epochCommitteeInfo = await this.epochCache.getCommitteeForEpoch(epoch);
    const proposer = this.epochCache.getProposerFromEpochCommittee({ ...epochCommitteeInfo, epoch }, slot);

    if (!proposer) {
      this.log.warn(
        `No proposer found for invalid descendant checkpoint ${checkpoint.checkpointNumber} at slot ${slot}`,
      );
      return;
    }

    const args: WantToSlashArgs = {
      validator: proposer,
      amount: this.config.slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty,
      offenseType: OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
      epochOrSlot: BigInt(slot),
    };

    this.log.info(`Detected invalid descendant checkpoint proposer offense`, {
      ...checkpoint,
      ancestorCheckpointNumber,
      ancestorArchiveRoot: ancestorArchiveRoot.toString(),
      validator: args.validator.toString(),
      amount: args.amount,
      offenseType: getOffenseTypeName(args.offenseType),
      epochOrSlot: args.epochOrSlot,
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
