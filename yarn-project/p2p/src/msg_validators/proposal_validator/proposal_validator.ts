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
import type { ConsensusTimetable } from '@aztec/stdlib/timetable';

/** Validates header-level and tx-level fields of block and checkpoint proposals. */
export class ProposalValidator {
  private epochCache: EpochCacheInterface;
  private timetable: ConsensusTimetable;
  private logger: Logger;
  private txsPermitted: boolean;
  private maxTxsPerBlock?: number;
  private maxBlocksPerCheckpoint?: number;
  private skipSlotValidation: boolean;
  private signatureContext: CoordinationSignatureContext;
  private clockDisparityMs: number;

  constructor(
    epochCache: EpochCacheInterface,
    timetable: ConsensusTimetable,
    opts: {
      txsPermitted: boolean;
      maxTxsPerBlock?: number;
      maxBlocksPerCheckpoint?: number;
      skipSlotValidation?: boolean;
      signatureContext: CoordinationSignatureContext;
      clockDisparityMs: number;
    },
    loggerName: string,
  ) {
    this.epochCache = epochCache;
    this.timetable = timetable;
    this.txsPermitted = opts.txsPermitted;
    this.maxTxsPerBlock = opts.maxTxsPerBlock;
    this.maxBlocksPerCheckpoint = opts.maxBlocksPerCheckpoint;
    this.skipSlotValidation = opts.skipSlotValidation ?? false;
    this.signatureContext = opts.signatureContext;
    this.clockDisparityMs = opts.clockDisparityMs;
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

      // Slot check: the tight checkpoint proposal receive window (`[receiveStart - δ, target_slot_start -
      // E - D + δ]`) is the sole acceptance gate, applied to both block and checkpoint proposals. The
      // window itself bounds which slots are valid, so far/wrong slots fall outside it. Every block
      // proposal for slot N is sent before the checkpoint proposal for slot N, so nothing legitimate can
      // arrive after the checkpoint receive deadline; gating block proposals on the same window rejects
      // late block proposals at p2p ingress. The attestation deadline remains their re-execution/
      // validation deadline downstream, not their arrival gate.
      const slotNumber = proposal.slotNumber;
      if (!this.skipSlotValidation) {
        // Proposal receive window: [checkpoint_proposal_receive_start, checkpoint_proposal_receive_deadline],
        // widened by the configured clock-disparity tolerance on both ends.
        const startSeconds = this.timetable.getCheckpointProposalReceiveStart(slotNumber);
        const deadlineSeconds = this.timetable.getCheckpointProposalReceiveDeadline(slotNumber);
        const nowMs = Number(this.epochCache.getEpochAndSlotNow().nowMs);
        if (
          nowMs < startSeconds * 1000 - this.clockDisparityMs ||
          nowMs > deadlineSeconds * 1000 + this.clockDisparityMs
        ) {
          this.logger.warn(`Penalizing peer for invalid slot number ${slotNumber}`, {
            slotNumber,
            nowMs,
            windowStartSeconds: startSeconds,
            windowDeadlineSeconds: deadlineSeconds,
          });
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
