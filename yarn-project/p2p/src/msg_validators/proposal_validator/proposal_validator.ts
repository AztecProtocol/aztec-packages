import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type BlockProposal,
  type CheckpointProposalCore,
  PeerErrorSeverity,
  type ValidationResult,
} from '@aztec/stdlib/p2p';

import { isWithinClockTolerance } from '../clock_tolerance.js';

/** Validates header-level and tx-level fields of block and checkpoint proposals. */
export class ProposalValidator {
  private epochCache: EpochCacheInterface;
  private logger: Logger;
  private txsPermitted: boolean;
  private maxTxsPerBlock?: number;

  constructor(
    epochCache: EpochCacheInterface,
    opts: { txsPermitted: boolean; maxTxsPerBlock?: number },
    loggerName: string,
  ) {
    this.epochCache = epochCache;
    this.txsPermitted = opts.txsPermitted;
    this.maxTxsPerBlock = opts.maxTxsPerBlock;
    this.logger = createLogger(loggerName);
  }

  /** Validates header-level fields: slot, signature, and proposer. */
  public async validate(proposal: BlockProposal | CheckpointProposalCore): Promise<ValidationResult> {
    try {
      // Slot check
      const { currentSlot, nextSlot } = this.epochCache.getCurrentAndNextSlot();
      const slotNumber = proposal.slotNumber;
      if (slotNumber !== currentSlot && slotNumber !== nextSlot) {
        // Check if message is for previous slot and within clock tolerance
        if (!isWithinClockTolerance(slotNumber, currentSlot, this.epochCache)) {
          this.logger.warn(`Penalizing peer for invalid slot number ${slotNumber}`, { currentSlot, nextSlot });
          return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
        }
        this.logger.verbose(`Ignoring proposal for previous slot ${slotNumber} within clock tolerance`);
        return { result: 'ignore' };
      }

      // Signature validity
      const proposer = proposal.getSender();
      if (!proposer) {
        this.logger.warn(`Penalizing peer for proposal with invalid signature`);
        return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError };
      }

      // Proposer check
      const expectedProposer = await this.epochCache.getProposerAttesterAddressInSlot(slotNumber);
      if (expectedProposer !== undefined && !proposer.equals(expectedProposer)) {
        this.logger.warn(`Penalizing peer for invalid proposer for current slot ${slotNumber}`, {
          expectedProposer,
          proposer: proposer.toString(),
        });
        return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError };
      }

      return { result: 'accept' };
    } catch (e) {
      if (e instanceof NoCommitteeError) {
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }
      throw e;
    }
  }

  /** Validates transaction-related fields of a block proposal. */
  public async validateTxs(proposal: BlockProposal): Promise<ValidationResult> {
    // Transactions permitted check
    const embeddedTxCount = proposal.txs?.length ?? 0;
    if (!this.txsPermitted && (proposal.txHashes.length > 0 || embeddedTxCount > 0)) {
      this.logger.warn(
        `Penalizing peer for proposal with ${proposal.txHashes.length} transaction(s) when transactions are not permitted`,
      );
      return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError };
    }

    // Max txs per block check
    if (this.maxTxsPerBlock !== undefined && proposal.txHashes.length > this.maxTxsPerBlock) {
      this.logger.warn(
        `Penalizing peer for proposal with ${proposal.txHashes.length} transaction(s) when max is ${this.maxTxsPerBlock}`,
      );
      return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError };
    }

    // Embedded txs must be listed in txHashes
    const hashSet = new Set(proposal.txHashes.map(h => h.toString()));
    const missingTxHashes =
      embeddedTxCount > 0
        ? proposal.txs!.filter(tx => !hashSet.has(tx.getTxHash().toString())).map(tx => tx.getTxHash().toString())
        : [];
    if (embeddedTxCount > 0 && missingTxHashes.length > 0) {
      this.logger.warn('Penalizing peer for embedded transaction(s) not included in txHashes', {
        embeddedTxCount,
        txHashesLength: proposal.txHashes.length,
        missingTxHashes,
      });
      return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError };
    }

    // Validate tx hashes for all txs embedded in the proposal
    if (!(await Promise.all(proposal.txs?.map(tx => tx.validateTxHash()) ?? [])).every(v => v)) {
      this.logger.warn(`Penalizing peer for invalid tx hashes in proposal`);
      return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
    }

    return { result: 'accept' };
  }
}
