import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type BlockProposal,
  type CheckpointProposalCore,
  type CoordinationSignatureContext,
  PeerErrorSeverity,
  type ValidationResult,
  hasValidSignatureContext,
} from '@aztec/stdlib/p2p';

import { PipeliningWindow } from '../clock_tolerance.js';

/** Type guard for checkpoint proposals (which carry a checkpoint header) vs plain block proposals. */
function isCheckpointProposal(proposal: BlockProposal | CheckpointProposalCore): proposal is CheckpointProposalCore {
  return 'checkpointHeader' in proposal;
}

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
      blockDurationMs?: number;
      skipSlotValidation?: boolean;
      signatureContext: CoordinationSignatureContext;
    },
    loggerName: string,
  ) {
    this.epochCache = epochCache;
    this.txsPermitted = opts.txsPermitted;
    this.maxTxsPerBlock = opts.maxTxsPerBlock;
    this.maxBlocksPerCheckpoint = opts.maxBlocksPerCheckpoint;
    this.pipeliningWindow = new PipeliningWindow(epochCache, { blockDurationMs: opts.blockDurationMs });
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

      // Slot check: the explicit receive window is the sole acceptance gate, enforced unconditionally
      // (the window itself bounds which slots are valid, so far/wrong slots fall outside it; no need to
      // special-case the build/target slots). Checkpoint proposals use the tight consensus receive
      // window (`[receiveStart - δ, target_slot_start - E - D + δ]`), which gates the next-proposer
      // handoff and must reject proposals that arrive after the checkpoint receive deadline even on the
      // common `messageSlot === targetSlot` path under pipelining. Block proposals use the looser
      // build-frame-to-attestation-deadline window.
      const { targetSlot, nextSlot } = this.epochCache.getTargetAndNextSlot();

      const slotNumber = proposal.slotNumber;
      if (!this.skipSlotValidation) {
        const withinWindow = isCheckpointProposal(proposal)
          ? this.pipeliningWindow.acceptsProposal(slotNumber)
          : this.pipeliningWindow.acceptsAttestation(slotNumber);
        if (!withinWindow) {
          this.logger.warn(`Penalizing peer for invalid slot number ${slotNumber}`, { targetSlot, nextSlot });
          return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
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
