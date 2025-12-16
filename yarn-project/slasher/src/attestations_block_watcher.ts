import { EpochCache } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  EthAddress,
  type InvalidBlockDetectedEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  PublishedL2Block,
  type ValidateBlockNegativeResult,
} from '@aztec/stdlib/block';
import { Offense } from '@aztec/stdlib/slashing';

import EventEmitter from 'node:events';

import {
  type SlasherConfig,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  type WatcherEmitter,
} from './config.js';

/**
 * This watcher is responsible for detecting invalid blocks and creating slashing arguments for offenders.
 * An invalid block is one that doesn't have enough attestations or has incorrect attestations.
 * The proposer of an invalid block should be slashed.
 * If there's another block consecutive to the invalid one, its proposer and attestors should also be slashed.
 */
export class AttestationsBlockWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private log: Logger = createLogger('attestations-block-watcher');

  // Only keep track of the last N invalid blocks
  private maxInvalidBlocks = 100;

  // All invalid archive roots seen
  private invalidArchiveRoots: Set<string> = new Set();

  // TODO(#16140): Bad validators are never cleared even after slashing
  private badAttestors: Set<string> = new Set();
  private badProposers: Set<string> = new Set();

  private boundHandleInvalidBlock = (event: InvalidBlockDetectedEvent) => {
    try {
      this.handleInvalidBlock(event);
    } catch (err) {
      this.log.error('Error handling invalid block', err, {
        ...event.validationResult.block.block.toBlockInfo(),
        ...event.validationResult.block.l1,
        reason: event.validationResult.reason,
      });
    }
  };

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private epochCache: EpochCache,
    private config: Pick<
      SlasherConfig,
      | 'slashAttestDescendantOfInvalidPenalty'
      | 'slashAttestDescendantOfInvalidMaxPenalty'
      | 'slashProposeInvalidAttestationsPenalty'
      | 'slashProposeInvalidAttestationsMaxPenalty'
    >,
  ) {
    super();
    this.log.info('InvalidBlockWatcher initialized');
  }

  public start() {
    this.l2BlockSource.on(L2BlockSourceEvents.InvalidAttestationsBlockDetected, this.boundHandleInvalidBlock);
    return Promise.resolve();
  }

  public stop() {
    this.l2BlockSource.removeListener(
      L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      this.boundHandleInvalidBlock,
    );
    return Promise.resolve();
  }

  public shouldSlash({ amount, offense, validator }: WantToSlashArgs): Promise<boolean> {
    const maxPenalty = this.getMaxPenalty(offense);
    const logData = { validator, amount, offense, maxPenalty };
    if (amount > maxPenalty) {
      this.log.warn(`Slash amount ${amount} exceeds maximum penalty ${maxPenalty} for offense ${offense}`, logData);
      return Promise.resolve(false);
    }

    if (this.hasOffended(offense, validator)) {
      this.log.verbose(`Agreeing to slash validator ${validator} for offense ${offense}`, logData);
      return Promise.resolve(true);
    }

    this.log.debug(`Refusing to slash validator ${validator} for offense ${offense}`, logData);
    return Promise.resolve(false);
  }

  private handleInvalidBlock(event: InvalidBlockDetectedEvent): void {
    const { validationResult } = event;
    const block = validationResult.block.block;

    // Check if we already have processed this block, archiver may emit the same event multiple times
    if (this.invalidArchiveRoots.has(block.archive.root.toString())) {
      this.log.trace(`Already processed invalid block ${block.number}`);
      return;
    }

    this.log.verbose(`Detected invalid block ${block.number}`, {
      ...block.toBlockInfo(),
      reason: validationResult.valid === false ? validationResult.reason : 'unknown',
    });

    // Store the invalid block
    this.addInvalidBlock(event.validationResult.block);

    // Slash the proposer of the invalid block
    this.slashProposer(event.validationResult);

    // Check if the parent of this block is invalid as well, if so, we will slash its attestors as well
    this.slashAttestorsOnAncestorInvalid(event.validationResult);
  }

  private slashAttestorsOnAncestorInvalid(validationResult: ValidateBlockNegativeResult) {
    const block = validationResult.block;

    const parentArchive = block.block.header.lastArchive.root.toString();
    if (this.invalidArchiveRoots.has(block.block.header.lastArchive.root.toString())) {
      const attestors = validationResult.attestations.map(a => a.getSender());
      this.log.info(`Want to slash attestors of block ${block.block.number} built on invalid block`, {
        ...block.block.toBlockInfo(),
        ...attestors,
        parentArchive,
      });

      attestors.forEach(attestor => this.badAttestors.add(attestor.toString()));

      this.emit(
        WANT_TO_SLASH_EVENT,
        attestors.map(attestor => ({
          validator: attestor,
          amount: this.config.slashAttestDescendantOfInvalidPenalty,
          offense: Offense.ATTESTED_DESCENDANT_OF_INVALID,
        })),
      );
    }
  }

  private slashProposer(validationResult: ValidateBlockNegativeResult) {
    const { reason, block } = validationResult;
    const blockNumber = block.block.number;
    const slot = block.block.header.getSlot();
    const proposer = this.epochCache.getProposerFromEpochCommittee(validationResult, slot);

    if (!proposer) {
      this.log.warn(`No proposer found for block ${blockNumber} at slot ${slot}`);
      return;
    }

    const offense = this.getOffenseFromInvalidationReason(reason);
    const amount = this.config.slashProposeInvalidAttestationsPenalty;
    const args: WantToSlashArgs = { validator: proposer, amount, offense };

    this.log.info(`Want to slash proposer of block ${blockNumber} due to ${reason}`, {
      ...block.block.toBlockInfo(),
      ...args,
    });

    this.badProposers.add(proposer.toString());
    this.emit(WANT_TO_SLASH_EVENT, [args]);
  }

  private getOffenseFromInvalidationReason(reason: ValidateBlockNegativeResult['reason']): Offense {
    switch (reason) {
      case 'invalid-attestation':
        return Offense.PROPOSED_INCORRECT_ATTESTATIONS;
      case 'insufficient-attestations':
        return Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS;
      default: {
        const _: never = reason;
        return Offense.UNKNOWN;
      }
    }
  }

  private getMaxPenalty(offense: Offense) {
    switch (offense) {
      case Offense.PROPOSED_INCORRECT_ATTESTATIONS:
      case Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS:
        return this.config.slashProposeInvalidAttestationsMaxPenalty;
      case Offense.ATTESTED_DESCENDANT_OF_INVALID:
        return this.config.slashProposeInvalidAttestationsMaxPenalty;
      default:
        return 0n;
    }
  }

  private hasOffended(offense: Offense, validator: EthAddress): boolean {
    switch (offense) {
      case Offense.PROPOSED_INCORRECT_ATTESTATIONS:
      case Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS:
        return this.badProposers.has(validator.toString());
      case Offense.ATTESTED_DESCENDANT_OF_INVALID:
        return this.badAttestors.has(validator.toString());
      default:
        return false;
    }
  }

  private addInvalidBlock(block: PublishedL2Block) {
    this.invalidArchiveRoots.add(block.block.archive.root.toString());

    // Prune old entries if we exceed the maximum
    if (this.invalidArchiveRoots.size > this.maxInvalidBlocks) {
      const oldestKey = this.invalidArchiveRoots.keys().next().value!;
      this.invalidArchiveRoots.delete(oldestKey);
    }
  }
}
