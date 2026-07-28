import type { Archiver } from '@aztec/archiver';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type Blob, encodeCheckpointBlobDataFromBlocks, getBlobsPerL1Block } from '@aztec/blob-lib';
import {
  INBOX_LAG_SECONDS,
  INITIAL_L2_BLOCK_NUM,
  MAX_L1_TO_L2_MSGS_PER_BLOCK,
  MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
} from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { validateFeeAssetPriceModifier } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  type CheckpointProposalHash,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { FifoSet } from '@aztec/foundation/fifo-set';
import type { LogData } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import type { BlockData, L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import type { CheckpointReexecutionTracker, ReexecutionOutcome } from '@aztec/stdlib/checkpoint';
import {
  getPreviousCheckpointInboxRollingHash,
  getPreviousCheckpointOutHashes,
  validateCheckpoint,
} from '@aztec/stdlib/checkpoint';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type {
  ITxProvider,
  MerkleTreeWriteOperations,
  ValidatorClientFullConfig,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import {
  type L1ToL2MessageSource,
  accumulateCheckpointOutHashes,
  getInboxCutoffTimestamp,
  isInboxConsumptionSufficient,
} from '@aztec/stdlib/messaging';
import type { BlockProposal, CheckpointAttestation, CheckpointProposalCore } from '@aztec/stdlib/p2p';
import type { ConsensusTimetable } from '@aztec/stdlib/timetable';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { CheckpointGlobalVariables, FailedTx, Tx } from '@aztec/stdlib/tx';
import {
  ReExFailedTxsError,
  ReExInitialStateMismatchError,
  ReExStateMismatchError,
  ReExTimeoutError,
  TransactionsNotAvailableError,
} from '@aztec/stdlib/validators';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import type { ValidatorMetrics } from './metrics.js';
import {
  type StreamingBlockCheckReason,
  type StreamingBlockCheckResult,
  checkStreamingBlockProposal,
} from './streaming_inbox_checks.js';

export type BlockProposalValidationFailureReason =
  | 'invalid_signature'
  | 'invalid_proposal'
  | 'parent_block_not_found'
  | 'parent_block_wrong_slot'
  // Streaming Inbox per-block acceptance failures.
  | StreamingBlockCheckReason
  | 'global_variables_mismatch'
  | 'block_number_already_exists'
  | 'txs_not_available'
  | 'state_mismatch'
  | 'failed_txs'
  | 'initial_state_mismatch'
  | 'timeout'
  | 'block_proposal_beyond_checkpoint'
  | 'checkpoint_proposal_equivocation'
  | 'unknown_error';

type ReexecuteTransactionsResult = {
  block: L2Block;
  failedTxs: FailedTx[];
  reexecutionTimeMs: number;
  totalManaUsed: number;
};

export type BlockProposalValidationSuccessResult = {
  isValid: true;
  blockNumber: BlockNumber;
  reexecutionResult?: ReexecuteTransactionsResult;
};

export type BlockProposalValidationFailureResult = {
  isValid: false;
  reason: BlockProposalValidationFailureReason;
  blockNumber?: BlockNumber;
  reexecutionResult?: ReexecuteTransactionsResult;
};

export type BlockProposalValidationResult = BlockProposalValidationSuccessResult | BlockProposalValidationFailureResult;

export type CheckpointProposalValidationFailureReason =
  | 'invalid_signature'
  | 'invalid_fee_asset_price_modifier'
  | 'last_block_not_found'
  | 'block_fetch_error'
  | 'world_state_not_synced'
  | 'checkpoint_already_published'
  | 'no_blocks_for_slot'
  | 'last_block_archive_mismatch'
  | 'too_many_blocks_in_checkpoint'
  | 'initial_archive_mismatch'
  | 'checkpoint_header_mismatch'
  | 'archive_mismatch'
  | 'out_hash_mismatch'
  // Streaming Inbox last-block censorship failure.
  | 'inbox_consumption_insufficient'
  | 'checkpoint_validation_failed';

/**
 * Mapping from a checkpoint-proposal validation failure reason to the tracker outcome that
 * `handleCheckpointProposal` should record. `undefined` means do not record (signature
 * couldn't be verified, or the checkpoint is already on L1 so the question is moot).
 */
/* eslint-disable camelcase */
const CHECKPOINT_VALIDATION_REASON_TO_OUTCOME: Record<
  CheckpointProposalValidationFailureReason,
  ReexecutionOutcome | undefined
> = {
  invalid_signature: undefined,
  invalid_fee_asset_price_modifier: 'invalid',
  checkpoint_already_published: undefined,
  last_block_not_found: 'unvalidated',
  block_fetch_error: 'unvalidated',
  world_state_not_synced: 'unvalidated',
  initial_archive_mismatch: 'unvalidated',
  no_blocks_for_slot: 'unvalidated',
  last_block_archive_mismatch: 'invalid',
  too_many_blocks_in_checkpoint: 'invalid',
  checkpoint_header_mismatch: 'invalid',
  archive_mismatch: 'invalid',
  out_hash_mismatch: 'invalid',
  inbox_consumption_insufficient: 'invalid',
  checkpoint_validation_failed: 'invalid',
};

export type CheckpointProposalValidationSuccessResult = {
  isValid: true;
  checkpointNumber: CheckpointNumber;
};

export type CheckpointProposalValidationFailureResult = {
  isValid: false;
  reason: CheckpointProposalValidationFailureReason;
  checkpointNumber?: CheckpointNumber;
};

export type CheckpointProposalValidationResult =
  | CheckpointProposalValidationSuccessResult
  | CheckpointProposalValidationFailureResult;

export type CheckpointProposalValidationFailureCallback = (
  proposal: CheckpointProposalCore,
  result: CheckpointProposalValidationFailureResult,
  proposalInfo: LogData,
) => void | Promise<void>;

type CheckpointComputationResult =
  | { checkpointNumber: CheckpointNumber; reason?: undefined }
  | { checkpointNumber?: undefined; reason: 'invalid_proposal' | 'global_variables_mismatch' };

type BlockProposalSlotValidationResult =
  | { isValid: true }
  | { isValid: false; reason: 'block_proposal_beyond_checkpoint' | 'checkpoint_proposal_equivocation' };

const MAX_TRACKED_INVALID_PROPOSAL_SLOTS = 1000;

/** Block-proposal validation failures that constitute a slashable invalid-block offense. */
export const SLASHABLE_BLOCK_PROPOSAL_VALIDATION_RESULT: BlockProposalValidationFailureReason[] = [
  'state_mismatch',
  'failed_txs',
  'global_variables_mismatch',
  'invalid_proposal',
  'parent_block_wrong_slot',
];

/** Checkpoint-proposal validation failures that constitute a slashable invalid-checkpoint offense. */
export const SLASHABLE_CHECKPOINT_PROPOSAL_VALIDATION_RESULT: Record<
  CheckpointProposalValidationFailureReason,
  boolean
> = {
  // enabled
  ['invalid_fee_asset_price_modifier']: true,
  ['checkpoint_header_mismatch']: true,
  // These late mismatches should normally be caught by earlier checks, but if reached after validating the local
  // checkpoint inputs, the proposer-signed payload disagrees with deterministic recomputation.
  ['archive_mismatch']: true,
  ['out_hash_mismatch']: true,
  ['no_blocks_for_slot']: true,
  ['too_many_blocks_in_checkpoint']: true,
  ['checkpoint_validation_failed']: true,
  ['last_block_archive_mismatch']: true,

  // disabled
  // Streaming Inbox last-block censorship: kept out of slashing while the streaming path is new; L1 `propose` is the
  // authoritative reject (Rollup__UnconsumedInboxMessages).
  ['inbox_consumption_insufficient']: false,
  ['invalid_signature']: false,
  ['last_block_not_found']: false,
  ['block_fetch_error']: false,
  ['world_state_not_synced']: false,
  // A reorg / divergent local chain, not a proposer offense (mirrors the block path's initial_state_mismatch).
  ['initial_archive_mismatch']: false,
  ['checkpoint_already_published']: false,
};

/**
 * Handles block and checkpoint proposals for both validator and non-validator nodes. Also tracks which slots
 * had a slashable invalid proposal or a proposal equivocation, exposing them via the
 * `InvalidProposalSlotSource` interface consumed by the attested-invalid-proposal slashing watcher. The
 * tracking is populated as a side effect of validating/re-executing proposals, so any node that re-executes
 * proposals (the default) can serve it — not only validators.
 */
export class ProposalHandler {
  public readonly tracer: Tracer;

  /** Cached last checkpoint validation result to avoid double-validation on validator nodes.
   *  Keyed by signed-payload hash so two proposals at the same (slot, archive) but with a
   *  different `feeAssetPriceModifier` (or any other signed field) are validated independently. */
  private lastCheckpointValidationResult?: {
    payloadHash: CheckpointProposalHash;
    result: CheckpointProposalValidationResult;
  };

  /** Archiver reference for setting proposed checkpoints (pipelining). Set via register(). */
  private archiver?: Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData'>;

  /** Returns current validator addresses for own-proposal detection. Set via register(). */
  private getOwnValidatorAddresses?: () => string[];

  /** P2P proposal pool access for deciding when retained proposals should block archiver processing. */
  private p2pClient?: Pick<P2P, 'getProposalsForSlot'>;

  private checkpointProposalValidationFailureCallback?: CheckpointProposalValidationFailureCallback;

  /** Slots at which a slashable invalid block or checkpoint proposal was observed. */
  private readonly slotsWithInvalidProposals = FifoSet.withLimit<SlotNumber>(MAX_TRACKED_INVALID_PROPOSAL_SLOTS);

  /** Slots at which a proposal equivocation was observed; suppresses attested-to-invalid-proposal slashing. */
  private readonly slotsWithProposalEquivocation = FifoSet.withLimit<SlotNumber>(MAX_TRACKED_INVALID_PROPOSAL_SLOTS);

  constructor(
    private checkpointsBuilder: FullNodeCheckpointsBuilder,
    private worldState: WorldStateSynchronizer,
    private blockSource: L2BlockSource & L2BlockSink,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private txProvider: ITxProvider,
    private blockProposalValidator: BlockProposalValidator,
    private epochCache: EpochCache,
    private timetable: ConsensusTimetable,
    private config: ValidatorClientFullConfig,
    private blobClient: BlobClientInterface,
    private reexecutionTracker: CheckpointReexecutionTracker,
    private metrics?: ValidatorMetrics,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('validator:proposal-handler'),
  ) {
    if (config.fishermanMode) {
      this.log = this.log.createChild('[FISHERMAN]');
    }
    this.tracer = telemetry.getTracer('ProposalHandler');
  }

  public updateConfig(config: Partial<ValidatorClientFullConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public setCheckpointProposalValidationFailureCallback(callback?: CheckpointProposalValidationFailureCallback): void {
    this.checkpointProposalValidationFailureCallback = callback;
  }

  /**
   * Records the proposer's own checkpoint proposal as a `valid` outcome in the re-execution
   * tracker. Without this, the node's own checkpoint proposals never flow through
   * `handleCheckpointProposal` (proposers don't validate their own proposals), so its sentinel
   * sees no outcome for slots where it was the proposer and reports itself as inactive.
   *
   * `archive` should be the locally-computed archive (NOT the broadcast archive, which may have
   * been deliberately corrupted in tests via `broadcastInvalidBlockProposal` /
   * `broadcastInvalidCheckpointProposalOnly`). Recording the local archive correctly models the
   * proposer's own view of its own work.
   */
  public recordOwnCheckpointProposalAsValid(slot: SlotNumber, archive: Fr, checkpointNumber: CheckpointNumber): void {
    this.reexecutionTracker.recordOutcome(slot, archive, 'valid', checkpointNumber);
  }

  /** Whether a slashable invalid block or checkpoint proposal was observed at the given slot (InvalidProposalSlotSource). */
  public hasInvalidProposals(slotNumber: SlotNumber): boolean {
    return this.slotsWithInvalidProposals.has(slotNumber);
  }

  /** Whether a proposal equivocation was observed at the given slot (InvalidProposalSlotSource). */
  public hasProposalEquivocation(slotNumber: SlotNumber): boolean {
    return this.slotsWithProposalEquivocation.has(slotNumber);
  }

  /** Records a slot as having a slashable invalid proposal, for offense observers (sentinel/slasher watchers). */
  public markInvalidProposalSlot(slotNumber: SlotNumber): void {
    this.slotsWithInvalidProposals.add(slotNumber);
  }

  /** Records a slot as having a proposal equivocation, which suppresses attested-to-invalid-proposal slashing. */
  public markProposalEquivocation(slotNumber: SlotNumber): void {
    this.slotsWithProposalEquivocation.add(slotNumber);
  }

  /**
   * Registers handlers for block and checkpoint proposals on the p2p client.
   * Records the p2p client so validation can inspect retained proposals.
   * Block proposals are registered for non-validator nodes (validators register their own enhanced handler).
   * The all-nodes checkpoint proposal handler is always registered for validation, caching, and pipelining.
   * @param archiver - Archiver reference for setting proposed checkpoints (pipelining)
   * @param getOwnValidatorAddresses - Returns current validator addresses for own-proposal detection
   */
  register(
    p2pClient: P2P,
    shouldReexecute: boolean,
    archiver?: Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData'>,
    getOwnValidatorAddresses?: () => string[],
  ): ProposalHandler {
    this.p2pClient = p2pClient;
    this.archiver = archiver;
    this.getOwnValidatorAddresses = getOwnValidatorAddresses;

    // Non-validator handler that processes or re-executes for monitoring but does not attest.
    // Returns boolean indicating whether the proposal was valid.
    const blockHandler = async (proposal: BlockProposal, proposalSender: PeerId): Promise<boolean> => {
      try {
        const { slotNumber, blockNumber } = proposal;
        const result = await this.handleBlockProposal(proposal, proposalSender, shouldReexecute);
        if (result.isValid) {
          this.log.info(`Non-validator block proposal ${blockNumber} at slot ${slotNumber} handled`, {
            blockNumber: result.blockNumber,
            slotNumber,
            reexecutionTimeMs: result.reexecutionResult?.reexecutionTimeMs,
            totalManaUsed: result.reexecutionResult?.totalManaUsed,
            numTxs: result.reexecutionResult?.block?.body?.txEffects?.length ?? 0,
            reexecuted: shouldReexecute,
          });
          return true;
        } else {
          // Track invalid proposals / equivocations so offense observers (the attested-invalid-proposal
          // watcher) work on non-validator nodes too. Validators populate these via their own handlers.
          // Skip invalid-proposal marking while the escape hatch is open, matching the validator path,
          // which intentionally disables invalid-block slashing then.
          if (result.reason === 'checkpoint_proposal_equivocation') {
            this.markProposalEquivocation(slotNumber);
          } else if (
            SLASHABLE_BLOCK_PROPOSAL_VALIDATION_RESULT.includes(result.reason) &&
            !(await this.epochCache.isEscapeHatchOpenAtSlot(slotNumber))
          ) {
            this.markInvalidProposalSlot(slotNumber);
          }
          this.log.warn(
            `Non-validator block proposal ${blockNumber} at slot ${slotNumber} failed processing with ${result.reason}`,
            { blockNumber: result.blockNumber, slotNumber, reason: result.reason },
          );
          return false;
        }
      } catch (error) {
        this.log.error('Error processing block proposal in non-validator handler', error);
        return false;
      }
    };

    p2pClient.registerBlockProposalHandler(blockHandler);

    // p2p detects duplicate (equivocated) proposals without routing them through the handlers above, so mark
    // the slot as equivocated here. This suppresses false-positive attested-to-invalid-proposal slashing on
    // non-validator offense collectors. Validators overwrite this with their own richer handler.
    p2pClient.registerDuplicateProposalCallback(info => this.markProposalEquivocation(info.slot));

    // All-nodes checkpoint proposal handler: validates, caches, and sets proposed checkpoint for pipelining.
    // Runs for all nodes (validators and non-validators). Validators get the cached result in the
    // validator-specific callback (attestToCheckpointProposal) which runs after this one.
    const checkpointHandler = async (
      proposal: CheckpointProposalCore,
      _sender: PeerId,
    ): Promise<CheckpointAttestation[] | undefined> => {
      try {
        const pipeliningTimer = new Timer();
        const proposalInfo: LogData = {
          slot: proposal.slotNumber,
          archive: proposal.archive.toString(),
          proposer: proposal.getSender()?.toString(),
        };

        if (this.config.skipCheckpointProposalValidation) {
          this.log.warn(`Skipping checkpoint proposal validation for slot ${proposal.slotNumber}`, proposalInfo);
          return undefined;
        }

        if (await this.epochCache.isEscapeHatchOpenAtSlot(proposal.slotNumber)) {
          this.log.warn(
            `Escape hatch open for slot ${proposal.slotNumber}, skipping checkpoint proposal validation`,
            proposalInfo,
          );
          return undefined;
        }

        // A proposal is "own" when it was signed by a validator key this node also owns. The true local
        // proposer already built, validated, and stored this checkpoint before broadcasting, so a matching
        // proposed checkpoint is already in its archiver — skip the redundant re-validation. An HA peer that
        // shares the proposer's keys sees the same "own" proposal over gossip but never built it, so it has
        // nothing stored; it falls through to the normal validate-and-persist path below to hydrate the
        // proposed-checkpoint metadata it needs to build the next slot on top of this checkpoint.
        const proposer = proposal.getSender();
        const ownAddresses = this.getOwnValidatorAddresses?.();
        const isOwnProposal = proposer && ownAddresses?.some(addr => addr === proposer.toString());

        if (isOwnProposal) {
          const existing = await this.archiver?.getProposedCheckpointData({ slot: proposal.slotNumber });
          if (existing?.archive.root.equals(proposal.archive)) {
            this.log.debug(`Skipping sync for existing own checkpoint proposal at slot ${proposal.slotNumber}`);
            return undefined;
          }
        }

        const result = await this.handleCheckpointProposal(proposal, proposalInfo);
        if (!result.isValid) {
          // Track invalid checkpoint proposals so offense observers (the attested-invalid-proposal watcher)
          // work on non-validator nodes too. This handler runs for all nodes; validators also mark via the
          // failure callback below (idempotent).
          if (SLASHABLE_CHECKPOINT_PROPOSAL_VALIDATION_RESULT[result.reason]) {
            this.markInvalidProposalSlot(proposal.slotNumber);
          }
          await this.checkpointProposalValidationFailureCallback?.(proposal, result, proposalInfo);
        } else if (this.archiver) {
          const set = await this.setProposedCheckpoint(proposal);
          if (set) {
            this.metrics?.recordCheckpointProposalToPipelinedStateDuration(pipeliningTimer.ms());
          }
        }
      } catch (err) {
        this.log.warn(`Error handling checkpoint proposal for slot ${proposal.slotNumber}`, { err });
      }
      return undefined;
    };

    p2pClient.registerAllNodesCheckpointProposalHandler(checkpointHandler);

    return this;
  }

  async handleBlockProposal(
    proposal: BlockProposal,
    proposalSender: PeerId,
    shouldReexecute: boolean,
  ): Promise<BlockProposalValidationResult> {
    const slotNumber = proposal.slotNumber;
    const proposer = proposal.getSender();

    // Reject proposals with invalid signatures
    if (!proposer) {
      this.log.warn(`Received proposal with invalid signature for slot ${slotNumber}`);
      return { isValid: false, reason: 'invalid_signature' };
    }

    const proposalInfo = {
      ...proposal.toBlockInfo(),
      proposer: proposer.toString(),
      blockNumber: undefined as BlockNumber | undefined,
      checkpointNumber: undefined as CheckpointNumber | undefined,
    };

    this.log.info(`Processing proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(t => t.toString()),
    });

    // Check that the proposal is from the current proposer, or the next proposer
    // This should have been handled by the p2p layer, but we double check here out of caution
    const validationResult = await this.blockProposalValidator.validate(proposal);
    if (validationResult.result !== 'accept') {
      this.log.warn(`Proposal is not valid, skipping processing`, proposalInfo);
      return { isValid: false, reason: 'invalid_proposal' };
    }

    const retainedSlotValidation = await this.validateNewBlockInSlot(proposal);
    if (!retainedSlotValidation.isValid) {
      this.log.info(`Block proposal conflicts with retained proposals, skipping archiver processing`, {
        ...proposalInfo,
        indexWithinCheckpoint: proposal.indexWithinCheckpoint,
        reason: retainedSlotValidation.reason,
      });
      return { isValid: false, blockNumber: proposal.blockNumber, reason: retainedSlotValidation.reason };
    }

    // The proposer builds ahead of L1 submission under pipelining, so the block source won't have
    // synced to the proposed slot yet. We deliberately do not wait for it to sync here, to avoid
    // eating into the attestation window.

    // Check that the parent proposal is a block we know, otherwise reexecution would fail.
    // If we don't find it immediately, we keep retrying for a while; it may be we still
    // need to process other block proposals to get to it.
    const parentBlock = await this.getParentBlock(proposal);
    if (parentBlock === undefined) {
      this.log.warn(`Parent block for proposal not found, skipping processing`, proposalInfo);
      return { isValid: false, reason: 'parent_block_not_found' };
    }

    // Check that the parent block's slot is not greater than the proposal's slot.
    if (parentBlock !== 'genesis' && parentBlock.header.getSlot() > slotNumber) {
      this.log.warn(`Parent block slot is greater than proposal slot, skipping processing`, {
        parentBlockSlot: parentBlock.header.getSlot().toString(),
        proposalSlot: slotNumber.toString(),
        ...proposalInfo,
      });
      return { isValid: false, reason: 'parent_block_wrong_slot' };
    }

    // Compute the block number based on the parent block
    const blockNumber =
      parentBlock === 'genesis'
        ? BlockNumber(INITIAL_L2_BLOCK_NUM)
        : BlockNumber(parentBlock.header.getBlockNumber() + 1);
    proposalInfo.blockNumber = blockNumber;

    // Check that this block number does not exist already. During a reorg the archiver can still hold a
    // stale block at this number (a different archive, about to be pruned) while the proposal carries the
    // rebuilt replacement; resolveExistingBlockAtNumber waits for the local prune in that case so the
    // rebuilt block is processed in time to attest, rather than being permanently dropped on a bare
    // number collision.
    const existingBlock = await this.resolveExistingBlockAtNumber(blockNumber, proposal.archive, slotNumber);
    if (existingBlock) {
      this.log.warn(`Block number ${blockNumber} already exists, skipping processing`, proposalInfo);
      return { isValid: false, blockNumber, reason: 'block_number_already_exists' };
    }

    // Collect txs from the proposal. We start doing this as early as possible,
    // and we do it even if we don't plan to re-execute the txs, so that we have them if another node needs them.
    const { txs, missingTxs } = await this.txProvider.getTxsForBlockProposal(proposal, blockNumber, {
      pinnedPeer: proposalSender,
      deadline: this.getReexecutionDeadline(slotNumber),
    });

    // Record the tx-collection outcome on the re-execution tracker
    this.reexecutionTracker.recordTxsCollected(slotNumber, proposal.indexWithinCheckpoint, missingTxs.length === 0);

    // If reexecution is disabled, bail. We were just interested in triggering tx collection.
    if (!shouldReexecute) {
      this.log.info(
        `Received valid block ${blockNumber} proposal at index ${proposal.indexWithinCheckpoint} on slot ${slotNumber}`,
        proposalInfo,
      );
      return { isValid: true, blockNumber };
    }

    // Compute the checkpoint number for this block and validate checkpoint consistency
    const checkpointResult = this.computeCheckpointNumber(proposal, parentBlock, proposalInfo);
    if (checkpointResult.reason) {
      return { isValid: false, blockNumber, reason: checkpointResult.reason };
    }
    const checkpointNumber = checkpointResult.checkpointNumber;
    proposalInfo.checkpointNumber = checkpointNumber;

    // Resolve this block's L1-to-L2 message bundle from its proposal bucket reference, gated by the four streaming
    // acceptance checks.
    const streamingResult = await this.runStreamingBlockChecks(proposal, blockNumber, parentBlock);
    if (!streamingResult.accepted) {
      this.log.warn(`Streaming Inbox block acceptance check failed, skipping processing`, {
        reason: streamingResult.reason,
        bucketRef: proposal.bucketRef?.toInspect(),
        ...proposalInfo,
      });
      return { isValid: false, blockNumber, reason: streamingResult.reason };
    }
    const l1ToL2Messages = streamingResult.bundle;

    // Check that all of the transactions in the proposal are available
    if (missingTxs.length > 0) {
      this.log.warn(`Missing ${missingTxs.length} txs to process proposal`, { ...proposalInfo, missingTxs });
      return { isValid: false, blockNumber, reason: 'txs_not_available' };
    }

    // Collect the out hashes of all the checkpoints before this one in the same epoch.
    // Mirror the proposer-side fallback: under pipelining the immediately-preceding cp may not
    // yet be on L1, in which case the helper grafts the locally-known proposed cp's outHash.
    const epoch = getEpochAtSlot(slotNumber, this.epochCache.getL1Constants());
    const previousCheckpointOutHashes = await getPreviousCheckpointOutHashes({
      blockSource: this.blockSource,
      epoch,
      checkpointNumber,
      l1Constants: this.epochCache.getL1Constants(),
      pipeliningEnabled: true,
      log: this.log,
    });

    const previousInboxRollingHash = await getPreviousCheckpointInboxRollingHash({
      blockSource: this.blockSource,
      checkpointNumber,
      log: this.log,
    });

    // Try re-executing the transactions in the proposal if needed
    let reexecutionResult;
    try {
      this.log.verbose(`Re-executing transactions in the proposal`, proposalInfo);
      reexecutionResult = await this.reexecuteTransactions(
        proposal,
        blockNumber,
        checkpointNumber,
        txs,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        previousInboxRollingHash,
      );
    } catch (error) {
      this.log.error(`Error reexecuting txs while processing block proposal`, error, proposalInfo);
      const reason = this.getReexecuteFailureReason(error);
      return { isValid: false, blockNumber, reason, reexecutionResult };
    }

    // If we succeeded, push this block into the archiver (unless disabled)
    if (reexecutionResult?.block && !this.config.skipPushProposedBlocksToArchiver) {
      await this.blockSource.addBlock(reexecutionResult.block);
    }

    this.log.info(
      `Successfully re-executed block ${blockNumber} proposal at index ${proposal.indexWithinCheckpoint} on slot ${slotNumber}`,
      { ...proposalInfo, ...pick(reexecutionResult, 'reexecutionTimeMs', 'totalManaUsed') },
    );

    return { isValid: true, blockNumber, reexecutionResult };
  }

  private async validateNewBlockInSlot(blockProposal: BlockProposal): Promise<BlockProposalSlotValidationResult> {
    if (!this.p2pClient) {
      return { isValid: true };
    }

    const { blockProposals, checkpointProposals } = await this.p2pClient.getProposalsForSlot(blockProposal.slotNumber);

    if (checkpointProposals.length === 0) {
      return { isValid: true };
    } else if (checkpointProposals.length > 1) {
      return { isValid: false, reason: 'checkpoint_proposal_equivocation' };
    } else {
      const checkpointProposal = checkpointProposals[0];
      const terminalBlock = blockProposals.find(block => block.archive.equals(checkpointProposal.archive));
      return terminalBlock !== undefined && blockProposal.indexWithinCheckpoint > terminalBlock.indexWithinCheckpoint
        ? { isValid: false, reason: 'block_proposal_beyond_checkpoint' }
        : { isValid: true };
    }
  }

  private async getParentBlock(proposal: BlockProposal): Promise<'genesis' | BlockData | undefined> {
    const parentArchive = proposal.blockHeader.lastArchive.root;
    const { genesisArchiveRoot } = await this.blockSource.getGenesisValues();

    if (parentArchive.equals(genesisArchiveRoot)) {
      return 'genesis';
    }

    const deadline = this.getReexecutionDeadline(proposal.slotNumber);
    const timeoutDurationMs = deadline.getTime() - this.dateProvider.now();

    try {
      return (
        (await this.blockSource.getBlockData({ archive: parentArchive })) ??
        (timeoutDurationMs <= 0
          ? undefined
          : await retryUntil(
              () =>
                this.blockSource.syncImmediate().then(() => this.blockSource.getBlockData({ archive: parentArchive })),
              'force archiver sync',
              { deadline, dateProvider: this.dateProvider },
              0.5,
            ))
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.log.debug(`Timed out getting parent block by archive root`, { parentArchive });
      } else {
        this.log.error('Error getting parent block by archive root', err, { parentArchive });
      }
      return undefined;
    }
  }

  /**
   * Resolves whether a block genuinely already exists at `blockNumber`. Returns the existing block only if
   * it is a true duplicate of the proposal (matching archive). During a reorg the archiver can still hold a
   * stale fork at this number (different archive) that is about to be pruned; in that case this forces L1
   * sync and waits, bounded by the re-execution deadline, for the prune to land, then returns `undefined` so
   * the rebuilt block proposal can be processed in time to attest. If the prune does not complete before the
   * deadline it returns the stale block, so the caller falls back to the safe `block_number_already_exists`
   * rejection.
   */
  private async resolveExistingBlockAtNumber(
    blockNumber: BlockNumber,
    proposalArchive: Fr,
    slotNumber: SlotNumber,
  ): Promise<BlockData | undefined> {
    const existingBlock = await this.blockSource.getBlockData({ number: blockNumber });
    if (!existingBlock || existingBlock.archive.root.equals(proposalArchive)) {
      return existingBlock;
    }

    // A different block already occupies this number: it may be a stale fork being pruned during a reorg, not a
    // genuine duplicate. Wait for the local prune rather than permanently rejecting the proposal.
    const deadline = this.getReexecutionDeadline(slotNumber);
    if (deadline.getTime() - this.dateProvider.now() <= 0) {
      return existingBlock;
    }

    this.log.warn(`Block number ${blockNumber} already exists, awaiting potential prune`, {
      blockNumber,
      existingArchive: existingBlock.archive.root.toString(),
      proposalArchive: proposalArchive.toString(),
    });

    try {
      const { block } = await retryUntil(
        async () => {
          await this.blockSource.syncImmediate();
          const block = await this.blockSource.getBlockData({ number: blockNumber });
          // Resolve once the existing block is gone (pruned) or has been replaced by one matching the
          // proposal — the same condition as the early return above. A matching block is returned so the
          // caller still treats it as a genuine duplicate; an `undefined` (pruned) block lets the proposal
          // be processed. Wrap in an object so the `undefined` case is still a truthy retry result.
          return block === undefined || block.archive.root.equals(proposalArchive) ? { block } : undefined;
        },
        `prune of stale block ${blockNumber}`,
        { deadline, dateProvider: this.dateProvider },
        0.5,
      );
      return block;
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.log.warn(`Timed out waiting for stale block ${blockNumber} to be pruned`, { blockNumber });
        return existingBlock;
      }
      throw err;
    }
  }

  private computeCheckpointNumber(
    proposal: BlockProposal,
    parentBlock: 'genesis' | BlockData,
    proposalInfo: object,
  ): CheckpointComputationResult {
    if (parentBlock === 'genesis') {
      // First block is in checkpoint 1
      if (proposal.indexWithinCheckpoint !== 0) {
        this.log.warn(`First block proposal has non-zero indexWithinCheckpoint`, proposalInfo);
        return { reason: 'invalid_proposal' };
      }
      return { checkpointNumber: CheckpointNumber.INITIAL };
    }

    if (proposal.indexWithinCheckpoint === 0) {
      // If this is the first block in a new checkpoint, increment the checkpoint number
      if (!(proposal.blockHeader.getSlot() > parentBlock.header.getSlot())) {
        this.log.warn(`Slot should be greater than parent block slot for first block in checkpoint`, proposalInfo);
        return { reason: 'invalid_proposal' };
      }
      return { checkpointNumber: CheckpointNumber(parentBlock.checkpointNumber + 1) };
    }

    // Otherwise it should follow the previous block in the same checkpoint
    if (proposal.indexWithinCheckpoint !== parentBlock.indexWithinCheckpoint + 1) {
      this.log.warn(`Non-sequential indexWithinCheckpoint`, proposalInfo);
      return { reason: 'invalid_proposal' };
    }
    if (proposal.blockHeader.getSlot() !== parentBlock.header.getSlot()) {
      this.log.warn(`Slot should be equal to parent block slot for non-first block in checkpoint`, proposalInfo);
      return { reason: 'invalid_proposal' };
    }

    // For non-first blocks in a checkpoint, validate global variables match parent (except blockNumber)
    const validationResult = this.validateNonFirstBlockInCheckpoint(proposal, parentBlock, proposalInfo);
    if (validationResult) {
      return validationResult;
    }

    return { checkpointNumber: parentBlock.checkpointNumber };
  }

  /**
   * Validates that a non-first block in a checkpoint has consistent global variables with its parent.
   * For blocks with indexWithinCheckpoint > 0, all global variables except blockNumber must match the parent.
   * @returns A failure result if validation fails, undefined if validation passes
   */
  private validateNonFirstBlockInCheckpoint(
    proposal: BlockProposal,
    parentBlock: BlockData,
    proposalInfo: object,
  ): CheckpointComputationResult | undefined {
    const proposalGlobals = proposal.blockHeader.globalVariables;
    const parentGlobals = parentBlock.header.globalVariables;

    // All global variables except blockNumber should match the parent
    // blockNumber naturally increments between blocks
    if (!proposalGlobals.chainId.equals(parentGlobals.chainId)) {
      this.log.warn(`Non-first block in checkpoint has mismatched chainId`, {
        ...proposalInfo,
        proposalChainId: proposalGlobals.chainId.toString(),
        parentChainId: parentGlobals.chainId.toString(),
      });
      return { reason: 'global_variables_mismatch' };
    }

    if (!proposalGlobals.version.equals(parentGlobals.version)) {
      this.log.warn(`Non-first block in checkpoint has mismatched version`, {
        ...proposalInfo,
        proposalVersion: proposalGlobals.version.toString(),
        parentVersion: parentGlobals.version.toString(),
      });
      return { reason: 'global_variables_mismatch' };
    }

    if (proposalGlobals.slotNumber !== parentGlobals.slotNumber) {
      this.log.warn(`Non-first block in checkpoint has mismatched slotNumber`, {
        ...proposalInfo,
        proposalSlotNumber: proposalGlobals.slotNumber,
        parentSlotNumber: parentGlobals.slotNumber,
      });
      return { reason: 'global_variables_mismatch' };
    }

    if (proposalGlobals.timestamp !== parentGlobals.timestamp) {
      this.log.warn(`Non-first block in checkpoint has mismatched timestamp`, {
        ...proposalInfo,
        proposalTimestamp: proposalGlobals.timestamp.toString(),
        parentTimestamp: parentGlobals.timestamp.toString(),
      });
      return { reason: 'global_variables_mismatch' };
    }

    if (!proposalGlobals.coinbase.equals(parentGlobals.coinbase)) {
      this.log.warn(`Non-first block in checkpoint has mismatched coinbase`, {
        ...proposalInfo,
        proposalCoinbase: proposalGlobals.coinbase.toString(),
        parentCoinbase: parentGlobals.coinbase.toString(),
      });
      return { reason: 'global_variables_mismatch' };
    }

    if (!proposalGlobals.feeRecipient.equals(parentGlobals.feeRecipient)) {
      this.log.warn(`Non-first block in checkpoint has mismatched feeRecipient`, {
        ...proposalInfo,
        proposalFeeRecipient: proposalGlobals.feeRecipient.toString(),
        parentFeeRecipient: parentGlobals.feeRecipient.toString(),
      });
      return { reason: 'global_variables_mismatch' };
    }

    if (!proposalGlobals.gasFees.equals(parentGlobals.gasFees)) {
      this.log.warn(`Non-first block in checkpoint has mismatched gasFees`, {
        ...proposalInfo,
        proposalGasFees: proposalGlobals.gasFees.toInspect(),
        parentGasFees: parentGlobals.gasFees.toInspect(),
      });
      return { reason: 'global_variables_mismatch' };
    }

    return undefined;
  }

  /**
   * Hard re-execution/validation deadline for any block or checkpoint proposal targeting `slotNumber`:
   * the single consensus `attestation_deadline` (`target_slot_start + S - 2E`). This is the latest the
   * checkpoint can land on L1 in the target slot; all nodes agree on it. Loosened from the previous
   * next-wall-clock-slot-boundary bound (see the timetable spec / refactor notes).
   */
  private getReexecutionDeadline(slotNumber: SlotNumber): Date {
    return new Date(this.timetable.getAttestationDeadline(slotNumber) * 1000);
  }

  private getReexecuteFailureReason(err: any): BlockProposalValidationFailureReason {
    if (err instanceof TransactionsNotAvailableError) {
      return 'txs_not_available';
    } else if (err instanceof ReExInitialStateMismatchError) {
      return 'initial_state_mismatch';
    } else if (err instanceof ReExStateMismatchError) {
      return 'state_mismatch';
    } else if (err instanceof ReExFailedTxsError) {
      return 'failed_txs';
    } else if (err instanceof ReExTimeoutError) {
      return 'timeout';
    } else {
      return 'unknown_error';
    }
  }

  /**
   * Runs the streaming-Inbox per-block acceptance checks for a block proposal and returns the derived L1-to-L2
   * message bundle for re-execution, or a rejection reason. The parent block's consumed total and the checkpoint's
   * starting total are derived from L1-to-L2 tree leaf counts; a parent whose count does not sit on a bucket boundary
   * is rejected inside {@link checkStreamingBlockProposal}.
   */
  private async runStreamingBlockChecks(
    proposal: BlockProposal,
    blockNumber: BlockNumber,
    parentBlock: 'genesis' | BlockData,
  ): Promise<StreamingBlockCheckResult> {
    const parentTotalMsgCount = this.getConsumedMsgTotal(parentBlock);
    const checkpointStartTotalMsgCount = await this.resolveCheckpointStartTotal(
      blockNumber,
      proposal.indexWithinCheckpoint,
      parentTotalMsgCount,
    );
    if (checkpointStartTotalMsgCount === undefined) {
      // The block before the checkpoint's first block has not synced locally, so the per-checkpoint cap origin is
      // unavailable: treat as an unknown local view. There is no bounded wait for the missing block yet.
      return { accepted: false, reason: 'bucket_unknown' };
    }
    const nowSeconds = BigInt(Math.floor(this.dateProvider.now() / 1000));
    return checkStreamingBlockProposal({
      messageSource: this.l1ToL2MessageSource,
      bucketRef: proposal.bucketRef,
      parentTotalMsgCount,
      checkpointStartTotalMsgCount,
      nowSeconds,
      lagSeconds: INBOX_LAG_SECONDS,
      perBlockCap: MAX_L1_TO_L2_MSGS_PER_BLOCK,
      perCheckpointCap: MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
    });
  }

  /** A block's L1-to-L2 message tree leaf count: the cumulative Inbox message count it consumed through. */
  private blockLeafCount(block: BlockData | L2Block): bigint {
    return BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
  }

  /** The cumulative Inbox message count consumed through a block: its L1-to-L2 tree leaf count (0 at genesis). */
  private getConsumedMsgTotal(block: 'genesis' | BlockData): bigint {
    return block === 'genesis' ? 0n : this.blockLeafCount(block);
  }

  /**
   * The cumulative Inbox message count consumed as of the parent checkpoint (the per-checkpoint cap origin). For a
   * checkpoint's first block this is the parent block's total; for a later block it is the leaf count of the block
   * before the checkpoint's first block. Returns undefined when that block has not synced locally.
   */
  private resolveCheckpointStartTotal(
    blockNumber: BlockNumber,
    indexWithinCheckpoint: number,
    parentTotalMsgCount: bigint,
  ): Promise<bigint | undefined> {
    return indexWithinCheckpoint === 0
      ? Promise.resolve(parentTotalMsgCount)
      : this.getPreBlockConsumedTotal(blockNumber - indexWithinCheckpoint);
  }

  /**
   * The cumulative Inbox message count consumed as of the block immediately before `firstBlockNumber` (its L1-to-L2
   * tree leaf count): 0 when that block is genesis, undefined when it has not synced locally.
   */
  private async getPreBlockConsumedTotal(firstBlockNumber: number): Promise<bigint | undefined> {
    const preBlockNumber = firstBlockNumber - 1;
    if (preBlockNumber < INITIAL_L2_BLOCK_NUM) {
      return 0n;
    }
    const preBlock = await this.blockSource.getBlockData({ number: BlockNumber(preBlockNumber) });
    return preBlock === undefined ? undefined : this.blockLeafCount(preBlock);
  }

  /**
   * Enforces the streaming-Inbox last-block minimum-consumption (censorship) rule for a checkpoint, mirroring
   * `ProposeLib.validateInboxConsumption`: the first bucket the checkpoint left unconsumed must be absent, past the
   * cutoff, or a cap-escape. Returns true (sufficient) when the checkpoint's consumption cannot be resolved against
   * the local Inbox view, deferring to L1 `propose` as the authoritative reject.
   */
  private async isLastBlockConsumptionSufficient(slot: SlotNumber, blocks: L2Block[]): Promise<boolean> {
    const lastBlockTotal = this.blockLeafCount(blocks[blocks.length - 1]);
    const checkpointStartTotal = await this.getPreBlockConsumedTotal(blocks[0].number);
    const lastConsumedBucket = await this.l1ToL2MessageSource.getInboxBucketByTotalMsgCount(lastBlockTotal);
    if (checkpointStartTotal === undefined || lastConsumedBucket === undefined) {
      return true;
    }
    const nextBucket = await this.l1ToL2MessageSource.getInboxBucket(lastConsumedBucket.seq + 1n);
    const cutoffTimestamp = getInboxCutoffTimestamp(slot, this.epochCache.getL1Constants(), INBOX_LAG_SECONDS);
    return isInboxConsumptionSufficient({
      nextBucket,
      cutoffTimestamp,
      checkpointStartTotalMsgCount: checkpointStartTotal,
      perCheckpointCap: MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
    });
  }

  /**
   * Derives the ordered list of L1-to-L2 messages a checkpoint consumed across its blocks, from the Inbox buckets
   * between the parent checkpoint's consumed position and the checkpoint's last block. Empty when
   * the checkpoint consumed nothing or its consumption cannot be resolved against the local Inbox view.
   */
  private async deriveCheckpointConsumedMessages(blocks: L2Block[]): Promise<Fr[]> {
    const checkpointStartTotal = await this.getPreBlockConsumedTotal(blocks[0].number);
    const lastBlockTotal = this.blockLeafCount(blocks[blocks.length - 1]);
    if (checkpointStartTotal === undefined || lastBlockTotal <= checkpointStartTotal) {
      return [];
    }
    const startBucket = await this.l1ToL2MessageSource.getInboxBucketByTotalMsgCount(checkpointStartTotal);
    const endBucket = await this.l1ToL2MessageSource.getInboxBucketByTotalMsgCount(lastBlockTotal);
    if (startBucket === undefined || endBucket === undefined) {
      return [];
    }
    return this.l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets(startBucket.seq, endBucket.seq);
  }

  async reexecuteTransactions(
    proposal: BlockProposal,
    blockNumber: BlockNumber,
    checkpointNumber: CheckpointNumber,
    txs: Tx[],
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    previousInboxRollingHash: Fr,
  ): Promise<ReexecuteTransactionsResult> {
    const { blockHeader, txHashes } = proposal;

    // If we do not have all of the transactions, then we should fail
    if (txs.length !== txHashes.length) {
      const foundTxHashes = txs.map(tx => tx.getTxHash());
      const missingTxHashes = txHashes.filter(txHash => !foundTxHashes.some(h => h.equals(txHash)));
      throw new TransactionsNotAvailableError(missingTxHashes);
    }

    const timer = new Timer();
    const slot = proposal.slotNumber;
    const config = this.checkpointsBuilder.getConfig();

    // Get prior blocks in this checkpoint (same slot before current block)
    const allBlocksInSlot = await this.blockSource.getBlocksForSlot(slot);
    const priorBlocks = allBlocksInSlot.filter(b => b.number < blockNumber && b.header.getSlot() === slot);

    // Fork before the block to be built
    const parentBlockNumber = BlockNumber(blockNumber - 1);
    await this.worldState.syncImmediate(parentBlockNumber);
    await using fork = await this.worldState.fork(parentBlockNumber);

    // Verify the fork's archive root matches the proposal's expected last archive.
    // If they don't match, our world state synced to a different chain and reexecution would fail.
    const forkArchiveRoot = new Fr((await fork.getTreeInfo(MerkleTreeId.ARCHIVE)).root);
    if (!forkArchiveRoot.equals(proposal.blockHeader.lastArchive.root)) {
      throw new ReExInitialStateMismatchError(proposal.blockHeader.lastArchive.root, forkArchiveRoot);
    }

    // Build checkpoint constants from proposal (excludes blockNumber which is per-block)
    const constants: CheckpointGlobalVariables = {
      chainId: new Fr(config.l1ChainId),
      version: new Fr(config.rollupVersion),
      slotNumber: slot,
      timestamp: blockHeader.globalVariables.timestamp,
      coinbase: blockHeader.globalVariables.coinbase,
      feeRecipient: blockHeader.globalVariables.feeRecipient,
      gasFees: blockHeader.globalVariables.gasFees,
    };

    // Create checkpoint builder with prior blocks. The messages the prior blocks consumed are not needed: this path
    // only re-executes and compares the new block, never completing the checkpoint (whose rolling hash they seed).
    const checkpointBuilder = await this.checkpointsBuilder.openCheckpoint(
      checkpointNumber,
      constants,
      0n, // only takes effect in the following checkpoint.
      [],
      previousCheckpointOutHashes,
      previousInboxRollingHash,
      fork,
      priorBlocks,
      this.log.getBindings(),
    );

    // Build the new block
    const deadline = this.getReexecutionDeadline(slot);
    const maxBlockGas =
      this.config.validateMaxL2BlockGas !== undefined || this.config.validateMaxDABlockGas !== undefined
        ? new Gas(this.config.validateMaxDABlockGas ?? Infinity, this.config.validateMaxL2BlockGas ?? Infinity)
        : undefined;
    const result = await checkpointBuilder.buildBlock(txs, blockNumber, blockHeader.globalVariables.timestamp, {
      isBuildingProposal: false,
      minValidTxs: 0,
      deadline,
      expectedEndState: blockHeader.state,
      maxTransactions: this.config.validateMaxTxsPerBlock,
      maxBlockGas,
      l1ToL2Messages,
    });

    const { block, failedTxs } = result;
    const numFailedTxs = failedTxs.length;

    this.log.verbose(`Block proposal ${blockNumber} at slot ${slot} transaction re-execution complete`, {
      numFailedTxs,
      numProposalTxs: txHashes.length,
      numProcessedTxs: block.body.txEffects.length,
      blockNumber,
      slot,
    });

    if (numFailedTxs > 0) {
      this.metrics?.recordFailedReexecution(proposal);
      throw new ReExFailedTxsError(numFailedTxs);
    }

    if (block.body.txEffects.length !== txHashes.length) {
      this.metrics?.recordFailedReexecution(proposal);
      throw new ReExTimeoutError();
    }

    // Throw a ReExStateMismatchError error if state updates do not match
    // Compare the full block structure (archive and header) from the built block with the proposal
    const archiveMatches = proposal.archive.equals(block.archive.root);
    const headerMatches = proposal.blockHeader.equals(block.header);
    if (!archiveMatches || !headerMatches) {
      this.log.warn(`Re-execution state mismatch for slot ${slot}`, {
        expectedArchive: block.archive.root.toString(),
        actualArchive: proposal.archive.toString(),
        expectedHeader: block.header.toInspect(),
        actualHeader: proposal.blockHeader.toInspect(),
      });
      this.metrics?.recordFailedReexecution(proposal);
      throw new ReExStateMismatchError(proposal.archive, block.archive.root);
    }

    const reexecutionTimeMs = timer.ms();
    const totalManaUsed = block.header.totalManaUsed.toNumber() / 1e6;

    this.metrics?.recordReex(reexecutionTimeMs, txs.length, totalManaUsed);

    return {
      block,
      failedTxs,
      reexecutionTimeMs,
      totalManaUsed,
    };
  }

  /**
   * Validates a checkpoint proposal, caches the result, and uploads blobs if configured.
   * Returns a cached result if the same proposal (archive + slot) was already validated.
   * Used by both the all-nodes callback (via register) and the validator client (via delegation).
   */
  async handleCheckpointProposal(
    proposal: CheckpointProposalCore,
    proposalInfo: LogData,
  ): Promise<CheckpointProposalValidationResult> {
    const slot = proposal.slotNumber;
    const payloadHash = proposal.getPayloadHash();

    // Check cache: same signed-payload hash means we already validated this exact proposal.
    if (this.lastCheckpointValidationResult && this.lastCheckpointValidationResult.payloadHash === payloadHash) {
      this.log.debug(`Returning cached validation result for checkpoint proposal at slot ${slot}`, proposalInfo);
      return this.lastCheckpointValidationResult.result;
    }

    const proposer = proposal.getSender();
    let result: CheckpointProposalValidationResult;
    if (!proposer) {
      this.log.warn(`Received checkpoint proposal with invalid signature for slot ${proposal.slotNumber}`);
      result = { isValid: false as const, reason: 'invalid_signature' };
    } else if (!validateFeeAssetPriceModifier(proposal.feeAssetPriceModifier)) {
      this.log.warn(
        `Received checkpoint proposal with invalid feeAssetPriceModifier ${proposal.feeAssetPriceModifier} for slot ${proposal.slotNumber}`,
      );
      result = { isValid: false, reason: 'invalid_fee_asset_price_modifier' };
    } else {
      result = await this.validateCheckpointProposal(proposal, proposalInfo);
    }

    this.lastCheckpointValidationResult = { payloadHash, result };

    // Record the outcome on the re-execution tracker.
    const outcome = result.isValid ? ('valid' as const) : CHECKPOINT_VALIDATION_REASON_TO_OUTCOME[result.reason];
    if (outcome !== undefined) {
      this.reexecutionTracker.recordOutcome(slot, proposal.archive, outcome, result.checkpointNumber);
    }

    // Drop tracker entries for checkpoints that have reached L1 finality.
    try {
      const tips = await this.blockSource.getL2Tips();
      const finalizedCheckpointNumber = tips.finalized.checkpoint.number;
      if (finalizedCheckpointNumber > 0) {
        this.reexecutionTracker.removeBefore(CheckpointNumber(finalizedCheckpointNumber + 1));
      }
    } catch (err) {
      this.log.error(`Error pruning reexecution tracker`, err, proposalInfo);
    }

    // Upload blobs to filestore if validation passed (fire and forget)
    if (result.isValid) {
      this.tryUploadBlobsForCheckpoint(proposal, proposalInfo);
    }

    return result;
  }

  /**
   * Validates a checkpoint proposal by building the full checkpoint and comparing it with the proposal.
   * @returns Validation result with isValid flag and reason if invalid.
   */
  async validateCheckpointProposal(
    proposal: CheckpointProposalCore,
    proposalInfo: LogData,
  ): Promise<CheckpointProposalValidationResult> {
    const slot = proposal.slotNumber;

    // Block-sync/validation deadline = the single consensus attestation_deadline (target_slot_start + S
    // - 2E): the latest moment the proposer can submit this checkpoint and still have it land on L1 in
    // the target slot. Keeping validation/attestation alive until then lets validators keep attesting
    // right up to the proposer's real publish cutoff.
    const deadline = this.getReexecutionDeadline(slot);

    // Wait for last block to sync by archive. The deadline is passed to retryUntil as an absolute date so
    // the remaining budget is derived from the date provider; a deadline already in the past times out
    // after a single attempt instead of looping (the immediate-timeout semantics of the deadline overload).
    let lastBlockData;
    try {
      lastBlockData = await retryUntil(
        async () => {
          await this.blockSource.syncImmediate();
          return await this.blockSource.getBlockData({ archive: proposal.archive });
        },
        `waiting for block with archive ${proposal.archive.toString()} for slot ${slot}`,
        { deadline, dateProvider: this.dateProvider },
        0.5,
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.log.warn(`Timed out waiting for block with archive matching checkpoint proposal`, proposalInfo);
        return { isValid: false, reason: 'last_block_not_found' };
      }
      this.log.error(`Error fetching last block for checkpoint proposal`, err, proposalInfo);
      return { isValid: false, reason: 'block_fetch_error' };
    }

    if (!lastBlockData) {
      this.log.warn(`Last block not found for checkpoint proposal`, proposalInfo);
      return { isValid: false, reason: 'last_block_not_found' };
    }

    // Refuse to attest if the block's enclosing checkpoint has already been published to L1.
    const existingCheckpoint = await this.blockSource.getCheckpointData({ number: lastBlockData.checkpointNumber });
    if (existingCheckpoint) {
      this.log.warn(`Refusing to attest to checkpoint proposal whose checkpoint is already on L1`, {
        ...proposalInfo,
        checkpointNumber: lastBlockData.checkpointNumber,
      });
      return {
        isValid: false,
        reason: 'checkpoint_already_published',
        checkpointNumber: lastBlockData.checkpointNumber,
      };
    }

    // Get all full blocks for the slot and checkpoint
    const blocks = await this.blockSource.getBlocksForSlot(slot);
    if (blocks.length === 0) {
      this.log.warn(`No blocks found for slot ${slot}`, proposalInfo);
      return { isValid: false, reason: 'no_blocks_for_slot', checkpointNumber: lastBlockData.checkpointNumber };
    }

    // Ensure the last block for this slot matches the archive in the checkpoint proposal
    if (!blocks.at(-1)?.archive.root.equals(proposal.archive)) {
      this.log.warn(`Last block archive mismatch for checkpoint proposal`, proposalInfo);
      return {
        isValid: false,
        reason: 'last_block_archive_mismatch',
        checkpointNumber: lastBlockData.checkpointNumber,
      };
    }

    // Note this condition should never trigger, since we dont process block proposals that exceed indexWithinCheckpoint
    const maxBlocksPerCheckpoint = this.config.maxBlocksPerCheckpoint;
    if (maxBlocksPerCheckpoint !== undefined && blocks.length > maxBlocksPerCheckpoint) {
      this.log.warn(`Checkpoint proposal exceeds maxBlocksPerCheckpoint`, {
        ...proposalInfo,
        blocksInProposal: blocks.length,
        maxBlocksPerCheckpoint,
      });
      return {
        isValid: false,
        reason: 'too_many_blocks_in_checkpoint',
        checkpointNumber: lastBlockData.checkpointNumber,
      };
    }

    this.log.debug(`Found ${blocks.length} blocks for slot ${slot}`, {
      ...proposalInfo,
      blockNumbers: blocks.map(b => b.number),
    });

    // Get checkpoint constants from first block
    const firstBlock = blocks[0];
    const constants = this.extractCheckpointConstants(firstBlock);
    const checkpointNumber = firstBlock.checkpointNumber;

    // Streaming Inbox: on the last block of a checkpoint, enforce the minimum-consumption
    // (censorship) rule before attesting. Reject (no attestation) if a mandatory bucket was left unconsumed.
    if (!(await this.isLastBlockConsumptionSufficient(slot, blocks))) {
      this.log.warn(`Streaming Inbox last-block censorship check failed, refusing to attest`, {
        ...proposalInfo,
        checkpointNumber,
      });
      return { isValid: false, reason: 'inbox_consumption_insufficient', checkpointNumber };
    }

    // Derive the checkpoint's consumed L1-to-L2 message list from the Inbox buckets between the parent checkpoint's
    // consumed position and the last block's (compact indexing). The messages are already in the db from per-block
    // validation; this list only drives the checkpoint's rolling-hash recomputation in completeCheckpoint.
    const l1ToL2Messages = await this.deriveCheckpointConsumedMessages(blocks);

    // Collect the out hashes of all the checkpoints before this one in the same epoch.
    // See note on the analogous block-proposal site: the helper handles pipelining lag.
    const epoch = getEpochAtSlot(slot, this.epochCache.getL1Constants());
    const previousCheckpointOutHashes = await getPreviousCheckpointOutHashes({
      blockSource: this.blockSource,
      epoch,
      checkpointNumber,
      l1Constants: this.epochCache.getL1Constants(),
      pipeliningEnabled: true,
      log: this.log,
    });

    const previousInboxRollingHash = await getPreviousCheckpointInboxRollingHash({
      blockSource: this.blockSource,
      checkpointNumber,
      log: this.log,
    });

    // Fork world state at the block before the first block. getFork syncs world state to the parent block
    // first (see its doc): the block source (archiver) can already hold the block while world state still
    // trails it by one, and forking a not-yet-applied block throws a raw tree error that would otherwise
    // escape as an uncaught gossipsub error. We pass the parent's expected block hash so the sync detects a
    // world-state reorg (undefined for the genesis parent, where no block exists to pin). On failure we map
    // to a clean validation result rather than letting it escape.
    const parentBlockNumber = BlockNumber(firstBlock.number - 1);
    let forkResult: MerkleTreeWriteOperations;
    try {
      const parentBlockHash = (await this.blockSource.getBlockData({ number: parentBlockNumber }))?.blockHash;
      forkResult = await this.checkpointsBuilder.getFork(parentBlockNumber, parentBlockHash);
    } catch (err) {
      this.log.warn(`Failed to fork world state at block ${parentBlockNumber} for checkpoint proposal`, {
        ...proposalInfo,
        parentBlockNumber,
        err,
      });
      return { isValid: false, reason: 'world_state_not_synced', checkpointNumber };
    }
    await using fork = forkResult;

    // Verify the fork's archive root matches the checkpoint's expected starting archive (the archive after
    // the parent block). A mismatch means world state forked from a different chain than the proposal was
    // built on (e.g. a reorg), so recomputing the checkpoint against it would be meaningless. This mirrors
    // the block-proposal re-execution check and fails fast with a clean, non-slashable result instead of a
    // confusing downstream mismatch.
    const forkArchiveRoot = new Fr((await fork.getTreeInfo(MerkleTreeId.ARCHIVE)).root);
    if (!forkArchiveRoot.equals(proposal.checkpointHeader.lastArchiveRoot)) {
      this.log.warn(`Fork archive root does not match checkpoint proposal's last archive`, {
        ...proposalInfo,
        forkArchiveRoot: forkArchiveRoot.toString(),
        expectedLastArchiveRoot: proposal.checkpointHeader.lastArchiveRoot.toString(),
      });
      return { isValid: false, reason: 'initial_archive_mismatch', checkpointNumber };
    }

    // Create checkpoint builder with all existing blocks
    const checkpointBuilder = await this.checkpointsBuilder.openCheckpoint(
      checkpointNumber,
      constants,
      proposal.feeAssetPriceModifier,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      previousInboxRollingHash,
      fork,
      blocks,
      this.log.getBindings(),
    );

    // Complete the checkpoint to get computed values
    const computedCheckpoint = await checkpointBuilder.completeCheckpoint();

    // Compare checkpoint header with proposal
    if (!computedCheckpoint.header.equals(proposal.checkpointHeader)) {
      this.log.warn(`Checkpoint header mismatch`, {
        ...proposalInfo,
        computed: computedCheckpoint.header.toInspect(),
        proposal: proposal.checkpointHeader.toInspect(),
      });
      return { isValid: false, reason: 'checkpoint_header_mismatch', checkpointNumber };
    }

    // Compare archive root with proposal
    if (!computedCheckpoint.archive.root.equals(proposal.archive)) {
      this.log.warn(`Archive root mismatch`, {
        ...proposalInfo,
        computed: computedCheckpoint.archive.root.toString(),
        proposal: proposal.archive.toString(),
      });
      return { isValid: false, reason: 'archive_mismatch', checkpointNumber };
    }

    // Check that the accumulated epoch out hash matches the value in the proposal.
    // The epoch out hash is the accumulated hash of all checkpoint out hashes in the epoch.
    const checkpointOutHash = computedCheckpoint.getCheckpointOutHash();
    const computedEpochOutHash = accumulateCheckpointOutHashes([...previousCheckpointOutHashes, checkpointOutHash]);
    const proposalEpochOutHash = proposal.checkpointHeader.epochOutHash;
    if (!computedEpochOutHash.equals(proposalEpochOutHash)) {
      this.log.warn(`Epoch out hash mismatch`, {
        proposalEpochOutHash: proposalEpochOutHash.toString(),
        computedEpochOutHash: computedEpochOutHash.toString(),
        checkpointOutHash: checkpointOutHash.toString(),
        previousCheckpointOutHashes: previousCheckpointOutHashes.map(h => h.toString()),
        ...proposalInfo,
      });
      return { isValid: false, reason: 'out_hash_mismatch', checkpointNumber };
    }

    // Final round of validations on the checkpoint, just in case.
    try {
      validateCheckpoint(computedCheckpoint, {
        rollupManaLimit: this.checkpointsBuilder.getConfig().rollupManaLimit,
        maxDABlockGas: this.config.validateMaxDABlockGas,
        maxL2BlockGas: this.config.validateMaxL2BlockGas,
        maxTxsPerBlock: this.config.validateMaxTxsPerBlock,
        maxTxsPerCheckpoint: this.config.validateMaxTxsPerCheckpoint,
      });
    } catch (err) {
      this.log.warn(`Checkpoint validation failed: ${err}`, proposalInfo);
      return { isValid: false, reason: 'checkpoint_validation_failed', checkpointNumber };
    }

    this.log.verbose(`Checkpoint proposal validation successful for slot ${slot}`, proposalInfo);

    return { isValid: true, checkpointNumber };
  }

  /** Extracts checkpoint global variables from a block. */
  private extractCheckpointConstants(block: L2Block): CheckpointGlobalVariables {
    const gv = block.header.globalVariables;
    return {
      chainId: gv.chainId,
      version: gv.version,
      slotNumber: gv.slotNumber,
      timestamp: gv.timestamp,
      coinbase: gv.coinbase,
      feeRecipient: gv.feeRecipient,
      gasFees: gv.gasFees,
    };
  }

  /** Triggers blob upload for a checkpoint if the blob client can upload (fire and forget). */
  protected tryUploadBlobsForCheckpoint(proposal: CheckpointProposalCore, proposalInfo: LogData): void {
    if (this.blobClient.canUpload()) {
      void this.uploadBlobsForCheckpoint(proposal, proposalInfo);
    }
  }

  /** Uploads blobs for a checkpoint to the filestore. */
  protected async uploadBlobsForCheckpoint(proposal: CheckpointProposalCore, proposalInfo: LogData): Promise<void> {
    try {
      const lastBlockHeader = (await this.blockSource.getBlockData({ archive: proposal.archive }))?.header;
      if (!lastBlockHeader) {
        this.log.warn(`Failed to get last block header for blob upload`, proposalInfo);
        return;
      }

      const blocks = await this.blockSource.getBlocksForSlot(proposal.slotNumber);
      if (blocks.length === 0) {
        this.log.warn(`No blocks found for blob upload`, proposalInfo);
        return;
      }

      const blockBlobData = blocks.map(b => b.toBlockBlobData());
      const blobFields = encodeCheckpointBlobDataFromBlocks(blockBlobData);
      const blobs: Blob[] = await getBlobsPerL1Block(blobFields);
      await this.blobClient.sendBlobsToFilestore(blobs);
      this.log.debug(`Uploaded ${blobs.length} blobs to filestore for checkpoint at slot ${proposal.slotNumber}`, {
        ...proposalInfo,
        numBlobs: blobs.length,
      });
    } catch (err) {
      this.log.warn(`Failed to upload blobs for checkpoint: ${err}`, proposalInfo);
    }
  }

  /**
   * Derives proposed checkpoint data from validated blocks and sets it on the archiver, so this node can
   * pipeline building on top of the checkpoint. Does not retry, since validation already waited for the
   * last block to sync.
   */
  private async setProposedCheckpoint(proposal: CheckpointProposalCore): Promise<boolean> {
    if (!this.archiver) {
      return false;
    }
    const blockData = await this.blockSource.getBlockData({ archive: proposal.archive });
    if (!blockData) {
      this.log.debug(`Block data not found for checkpoint proposal archive, cannot set proposed checkpoint`, {
        archive: proposal.archive.toString(),
      });
      return false;
    }

    await this.archiver.addProposedCheckpoint({
      header: proposal.checkpointHeader,
      checkpointNumber: blockData.checkpointNumber,
      startBlock: BlockNumber(blockData.header.getBlockNumber() - blockData.indexWithinCheckpoint),
      blockCount: blockData.indexWithinCheckpoint + 1,
      totalManaUsed: proposal.checkpointHeader.totalManaUsed.toBigInt(),
      feeAssetPriceModifier: proposal.feeAssetPriceModifier,
    });
    return true;
  }
}
