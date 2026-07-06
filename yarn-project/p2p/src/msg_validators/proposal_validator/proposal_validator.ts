import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type BlockProposal,
  type CheckpointProposalCore,
  type CoordinationSignatureContext,
  hasValidSignatureContext,
} from '@aztec/stdlib/consensus';

import { PeerErrorSeverity, type ValidationResult } from '../../types/index.js';
import { PipeliningWindow, isWithinClockTolerance } from '../clock_tolerance.js';

/** Validates header-level and tx-level fields of block and checkpoint proposals. */
export class ProposalValidator {
  private epochCache: EpochCacheInterface;
  private logger: Logger;
  private txsPermitted: boolean;
  private maxTxsPerBlock?: number;
  private maxBlocksPerCheckpoint?: number;
  private pipeliningWindow: PipeliningWindow;
  private skipSlotValidation: boolean;
  private signatureContext: CoordinationSignatureContext;

  constructor(
    epochCache: EpochCacheInterface,
    opts: {
      txsPermitted: boolean;
      maxTxsPerBlock?: number;
      maxBlocksPerCheckpoint?: number;
      p2pPropagationTime?: number;
      skipSlotValidation?: boolean;
      signatureContext: CoordinationSignatureContext;
    },
    loggerName: string,
  ) {
    this.epochCache = epochCache;
    this.txsPermitted = opts.txsPermitted;
    this.maxTxsPerBlock = opts.maxTxsPerBlock;
    this.maxBlocksPerCheckpoint = opts.maxBlocksPerCheckpoint;
    this.pipeliningWindow = new PipeliningWindow(epochCache, { p2pPropagationTime: opts.p2pPropagationTime });
    this.skipSlotValidation = opts.skipSlotValidation ?? false;
    this.signatureContext = opts.signatureContext;
    this.logger = createLogger(loggerName);
  }

  /** Validates header-level fields: slot, signature, and proposer. */
  public async validate(proposal: BlockProposal | CheckpointProposalCore): Promise<ValidationResult> {
    try {
      // Cross-chain replay check: reject proposals that carry a foreign signing domain.
      if (!hasValidSignatureContext(proposal, this.signatureContext)) {
        this.logger.warn(`Penalizing peer for proposal with foreign signature context`, {
          chainId: proposal.signatureContext.chainId,
          rollupAddress: proposal.signatureContext.rollupAddress.toString(),
          expectedChainId: this.signatureContext.chainId,
          expectedRollupAddress: this.signatureContext.rollupAddress.toString(),
        });
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }

      // Slot check: use target slots since proposals target pipeline slots (slot + 1 when pipelining).
      const { targetSlot, nextSlot } = this.epochCache.getTargetAndNextSlot();

      const slotNumber = proposal.slotNumber;
      if (!this.skipSlotValidation && slotNumber !== targetSlot && slotNumber !== nextSlot) {
        // When pipelining, accept proposals for the current slot (built in the previous slot)
        // if they're still within the shared proposal acceptance window.
        if (this.pipeliningWindow.acceptsProposal(slotNumber)) {
          // Fall through to remaining validation (signature, proposer, etc.)
        } else if (!isWithinClockTolerance(slotNumber, targetSlot, this.epochCache)) {
          this.logger.warn(`Penalizing peer for invalid slot number ${slotNumber}`, { targetSlot, nextSlot });
          return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
        } else {
          this.logger.verbose(`Ignoring proposal for previous slot ${slotNumber} within clock tolerance`);
          return { result: 'ignore' };
        }
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

      if (
        this.maxBlocksPerCheckpoint !== undefined &&
        'indexWithinCheckpoint' in proposal &&
        proposal.indexWithinCheckpoint >= this.maxBlocksPerCheckpoint
      ) {
        this.logger.warn(
          `Penalizing peer for proposal with indexWithinCheckpoint ${proposal.indexWithinCheckpoint} >= max ${this.maxBlocksPerCheckpoint}`,
        );
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
