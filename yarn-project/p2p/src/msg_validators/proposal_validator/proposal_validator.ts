import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import type { SlotNumber } from '@aztec/foundation/branded-types';
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

/** Identifies which sub-check of proposal validation rejected a proposal. */
export type ProposalRejectionCode =
  | 'foreign_signature_context'
  | 'outside_receive_window'
  | 'invalid_signature'
  | 'no_expected_proposer'
  | 'wrong_proposer'
  | 'index_beyond_attestable_ceiling'
  | 'no_committee'
  | 'txs_not_permitted'
  | 'too_many_txs'
  | 'embedded_tx_not_listed'
  | 'invalid_embedded_tx_hash';

/**
 * A `ValidationResult` from proposal validation, annotated with the sub-check that produced it so callers
 * can log or attribute a rejection without re-deriving it.
 */
export type ProposalValidationResult = ValidationResult & { code?: ProposalRejectionCode };

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

  /**
   * Validates header-level fields for a proposal arriving from the network: signature context, arrival
   * inside the receive window, signature, proposer, and block index.
   */
  public validate(proposal: BlockProposal | CheckpointProposalCore): Promise<ProposalValidationResult> {
    const contextResult = this.validateSignatureContext(proposal);
    if (contextResult.result !== 'accept') {
      return Promise.resolve(contextResult);
    }

    const windowResult = this.validateReceiveWindow(proposal.slotNumber);
    if (windowResult.result !== 'accept') {
      return Promise.resolve(windowResult);
    }

    return this.validateSignerAndIndex(proposal);
  }

  /**
   * Validates every header-level field except arrival inside the receive window: signature context,
   * signature, proposer, and block index. All of these are properties of the signed payload, so they give
   * the same answer no matter when they run — unlike the receive-window check, whose outcome depends on the
   * wall clock at the moment of evaluation. Callers that already accepted a proposal on arrival use this so
   * a slow local pipeline cannot turn an on-time proposal into an invalid one.
   */
  public validateStableFields(proposal: BlockProposal | CheckpointProposalCore): Promise<ProposalValidationResult> {
    const contextResult = this.validateSignatureContext(proposal);
    if (contextResult.result !== 'accept') {
      return Promise.resolve(contextResult);
    }

    return this.validateSignerAndIndex(proposal);
  }

  /** Cross-chain replay check: rejects proposals that carry a foreign signing domain. */
  private validateSignatureContext(proposal: BlockProposal | CheckpointProposalCore): ProposalValidationResult {
    if (!hasValidSignatureContext(proposal, this.signatureContext)) {
      this.logger.warn(`Penalizing peer for proposal with foreign signature context`, {
        chainId: proposal.signatureContext.chainId,
        rollupAddress: proposal.signatureContext.rollupAddress.toString(),
        expectedChainId: this.signatureContext.chainId,
        expectedRollupAddress: this.signatureContext.rollupAddress.toString(),
      });
      return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError, code: 'foreign_signature_context' };
    }
    return { result: 'accept' };
  }

  /**
   * Slot check: the tight checkpoint proposal receive window (`[receiveStart - δ, target_slot_start - E - D
   * + δ]`) is the sole acceptance gate, applied to both block and checkpoint proposals. The window itself
   * bounds which slots are valid, so far/wrong slots fall outside it. Every block proposal for slot N is
   * sent before the checkpoint proposal for slot N, so nothing legitimate can arrive after the checkpoint
   * receive deadline; gating block proposals on the same window rejects late block proposals at p2p
   * ingress. The attestation deadline remains their re-execution/validation deadline downstream, not their
   * arrival gate.
   *
   * This is the only time-of-check-sensitive part of proposal validation: it answers "did this arrive on
   * time", not "is this proposal well-formed", so it belongs to arrival handling alone.
   */
  private validateReceiveWindow(slotNumber: SlotNumber): ProposalValidationResult {
    if (this.skipSlotValidation) {
      return { result: 'accept' };
    }

    // Proposal receive window: [checkpoint_proposal_receive_start, checkpoint_proposal_receive_deadline],
    // widened by the configured clock-disparity tolerance on both ends.
    const startSeconds = this.timetable.getCheckpointProposalReceiveStart(slotNumber);
    const deadlineSeconds = this.timetable.getCheckpointProposalReceiveDeadline(slotNumber);
    const nowMs = Number(this.epochCache.getEpochAndSlotNow().nowMs);
    if (nowMs < startSeconds * 1000 - this.clockDisparityMs || nowMs > deadlineSeconds * 1000 + this.clockDisparityMs) {
      this.logger.warn(`Penalizing peer for invalid slot number ${slotNumber}`, {
        slotNumber,
        nowMs,
        windowStartSeconds: startSeconds,
        windowDeadlineSeconds: deadlineSeconds,
      });
      return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError, code: 'outside_receive_window' };
    }

    return { result: 'accept' };
  }

  /** Validates the proposal signature, the expected proposer for the slot, and the block index. */
  private async validateSignerAndIndex(
    proposal: BlockProposal | CheckpointProposalCore,
  ): Promise<ProposalValidationResult> {
    const slotNumber = proposal.slotNumber;
    try {
      // Signature validity
      const proposer = proposal.getSender();
      if (!proposer) {
        this.logger.warn(`Penalizing peer for proposal with invalid signature`);
        return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError, code: 'invalid_signature' };
      }

      // Proposer check
      const expectedProposer = await this.epochCache.getProposerAttesterAddressInSlot(slotNumber);
      if (expectedProposer === undefined) {
        this.logger.warn(`Penalizing peer for proposal with no expected proposer for current slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError, code: 'no_expected_proposer' };
      }
      if (!proposer.equals(expectedProposer)) {
        this.logger.warn(`Penalizing peer for invalid proposer for current slot ${slotNumber}`, {
          expectedProposer,
          proposer: proposer.toString(),
        });
        return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError, code: 'wrong_proposer' };
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
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError, code: 'no_committee' };
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
  public validateBlockIndexWithinCheckpoint(proposal: BlockProposal): ProposalValidationResult {
    if (proposal.indexWithinCheckpoint >= MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT) {
      this.logger.warn(
        `Penalizing peer for proposal with indexWithinCheckpoint ${proposal.indexWithinCheckpoint} >= attestable ceiling ${MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT}`,
      );
      return {
        result: 'reject',
        severity: PeerErrorSeverity.MidToleranceError,
        code: 'index_beyond_attestable_ceiling',
      };
    }
    return { result: 'accept' };
  }

  /** Validates transaction-related fields of a block proposal. */
  public async validateTxs(proposal: BlockProposal): Promise<ProposalValidationResult> {
    // Transactions permitted check
    const embeddedTxCount = proposal.txs?.length ?? 0;
    if (!this.txsPermitted && (proposal.txHashes.length > 0 || embeddedTxCount > 0)) {
      this.logger.warn(
        `Penalizing peer for proposal with ${proposal.txHashes.length} transaction(s) when transactions are not permitted`,
      );
      return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError, code: 'txs_not_permitted' };
    }

    // Max txs per block check
    if (this.maxTxsPerBlock !== undefined && proposal.txHashes.length > this.maxTxsPerBlock) {
      this.logger.warn(
        `Penalizing peer for proposal with ${proposal.txHashes.length} transaction(s) when max is ${this.maxTxsPerBlock}`,
      );
      return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError, code: 'too_many_txs' };
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
      return { result: 'reject', severity: PeerErrorSeverity.MidToleranceError, code: 'embedded_tx_not_listed' };
    }

    // Validate tx hashes for all txs embedded in the proposal
    if (!(await Promise.all(proposal.txs?.map(tx => tx.validateTxHash()) ?? [])).every(v => v)) {
      this.logger.warn(`Penalizing peer for invalid tx hashes in proposal`);
      return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError, code: 'invalid_embedded_tx_hash' };
    }

    return { result: 'accept' };
  }
}
