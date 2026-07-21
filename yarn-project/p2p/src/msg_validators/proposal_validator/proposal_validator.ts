import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT } from '@aztec/stdlib/deserialization';
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
      if (expectedProposer === undefined) {
        this.logger.warn(`Penalizing peer for proposal with no expected proposer for current slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }
      if (!proposer.equals(expectedProposer)) {
        this.logger.warn(`Penalizing peer for invalid proposer for current slot ${slotNumber}`, {
          expectedProposer,
          proposer: proposer.toString(),
        });
        return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError };
      }

      // A block proposal whose index lands at or beyond the hard attestable ceiling is structurally
      // impossible garbage, so reject it immediately at ingress. Indices in
      // `[maxBlocksPerCheckpoint, MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT)` are over the consensus limit
      // but structurally valid proposer misbehavior; they pass gossip validation here so the offending
      // proposal can be retained and re-broadcast as slashing evidence (handled downstream in the p2p
      // service), rather than penalizing the relaying peer.
      if ('indexWithinCheckpoint' in proposal) {
        const indexResult = this.validateBlockIndexWithinCheckpoint(proposal);
        if (indexResult.result !== 'accept') {
          return indexResult;
        }
      }

      return { result: 'accept' };
    } catch (e) {
      if (e instanceof NoCommitteeError) {
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }
      throw e;
    }
  }

  /**
   * Rejects a block proposal whose index within its checkpoint lands at or beyond the hard attestable
   * ceiling `MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT` (a structurally impossible index that can never be
   * part of any checkpoint we could attest to). `indexWithinCheckpoint` is 0-based, so a ceiling of 72
   * rejects the 73rd block.
   *
   * Indices in `[maxBlocksPerCheckpoint, MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT)` are over the configured
   * consensus limit but still structurally valid: they are proposer misbehavior, not relaying-peer
   * fault, so they are *not* rejected here. The p2p service retains and re-broadcasts the first such
   * proposal per (slot, proposer) as slashing evidence and skips processing it. Applies to standalone
   * block proposals and to the terminal block embedded in a checkpoint proposal.
   */
  public validateBlockIndexWithinCheckpoint(proposal: BlockProposal): ValidationResult {
    if (proposal.indexWithinCheckpoint >= MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT) {
      this.logger.warn(
        `Penalizing peer for proposal with indexWithinCheckpoint ${proposal.indexWithinCheckpoint} >= attestable ceiling ${MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT}`,
      );
      return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError };
    }
    return { result: 'accept' };
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
