import type { Archiver } from '@aztec/archiver';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type Blob, encodeCheckpointBlobDataFromBlocks, getBlobsPerL1Block } from '@aztec/blob-lib';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { validateFeeAssetPriceModifier } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import type { LogData } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import type { BlockData, L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { validateCheckpoint } from '@aztec/stdlib/checkpoint';
import { getEpochAtSlot, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type { ITxProvider, ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import {
  type L1ToL2MessageSource,
  accumulateCheckpointOutHashes,
  computeInHashFromL1ToL2Messages,
} from '@aztec/stdlib/messaging';
import type { BlockProposal, CheckpointAttestation, CheckpointProposalCore } from '@aztec/stdlib/p2p';
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

export type BlockProposalValidationFailureReason =
  | 'invalid_proposal'
  | 'parent_block_not_found'
  | 'block_source_not_synced'
  | 'parent_block_wrong_slot'
  | 'in_hash_mismatch'
  | 'global_variables_mismatch'
  | 'block_number_already_exists'
  | 'txs_not_available'
  | 'state_mismatch'
  | 'failed_txs'
  | 'initial_state_mismatch'
  | 'timeout'
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

export type CheckpointProposalValidationResult = { isValid: true } | { isValid: false; reason: string };

type CheckpointComputationResult =
  | { checkpointNumber: CheckpointNumber; reason?: undefined }
  | { checkpointNumber?: undefined; reason: 'invalid_proposal' | 'global_variables_mismatch' };

/** Handles block and checkpoint proposals for both validator and non-validator nodes. */
export class ProposalHandler {
  public readonly tracer: Tracer;

  /** Cached last checkpoint validation result to avoid double-validation on validator nodes. */
  private lastCheckpointValidationResult?: {
    archive: Fr;
    slotNumber: SlotNumber;
    result: CheckpointProposalValidationResult;
  };

  /** Archiver reference for setting proposed checkpoints (pipelining). Set via register(). */
  private archiver?: Pick<Archiver, 'setProposedCheckpoint' | 'getL1Constants'>;

  /** Returns current validator addresses for own-proposal detection. Set via register(). */
  private getOwnValidatorAddresses?: () => string[];

  constructor(
    private checkpointsBuilder: FullNodeCheckpointsBuilder,
    private worldState: WorldStateSynchronizer,
    private blockSource: L2BlockSource & L2BlockSink,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private txProvider: ITxProvider,
    private blockProposalValidator: BlockProposalValidator,
    private epochCache: EpochCache,
    private config: ValidatorClientFullConfig,
    private blobClient: BlobClientInterface,
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

  /**
   * Registers handlers for block and checkpoint proposals on the p2p client.
   * Block proposals are registered for non-validator nodes (validators register their own enhanced handler).
   * The all-nodes checkpoint proposal handler is always registered for validation, caching, and pipelining.
   * @param archiver - Archiver reference for setting proposed checkpoints (pipelining)
   * @param getOwnValidatorAddresses - Returns current validator addresses for own-proposal detection
   */
  register(
    p2pClient: P2P,
    shouldReexecute: boolean,
    archiver?: Pick<Archiver, 'setProposedCheckpoint' | 'getL1Constants'>,
    getOwnValidatorAddresses?: () => string[],
  ): ProposalHandler {
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

        // For own proposals, skip validation — the proposer already built and validated the checkpoint
        const proposer = proposal.getSender();
        const ownAddresses = this.getOwnValidatorAddresses?.();
        const isOwnProposal = proposer && ownAddresses?.some(addr => addr === proposer.toString());

        if (isOwnProposal) {
          this.log.debug(`Skipping validation for own checkpoint proposal at slot ${proposal.slotNumber}`);
          if (this.archiver && this.epochCache.isProposerPipeliningEnabled()) {
            await this.setProposedCheckpointFromBlocks(proposal);
          }
          return undefined;
        }

        const result = await this.handleCheckpointProposal(proposal, proposalInfo);
        if (result.isValid && this.archiver && this.epochCache.isProposerPipeliningEnabled()) {
          const set = await this.setProposedCheckpointFromValidation(proposal);
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
    const config = this.checkpointsBuilder.getConfig();

    // Reject proposals with invalid signatures
    if (!proposer) {
      this.log.warn(`Received proposal with invalid signature for slot ${slotNumber}`);
      return { isValid: false, reason: 'invalid_proposal' };
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

    // Ensure the block source is synced before checking for existing blocks,
    // since a proposed checkpoint prune may remove blocks we'd otherwise find.
    // This affects mostly the block_number_already_exists check, since a pending
    // checkpoint prune could remove a block that would conflict with this proposal.
    // When pipelining is enabled, the proposer builds ahead of L1 submission, so the
    // block source won't have synced to the proposed slot yet. Skip the sync wait to
    // avoid eating into the attestation window.
    if (!this.epochCache.isProposerPipeliningEnabled()) {
      const blockSourceSync = await this.waitForBlockSourceSync(slotNumber);
      if (!blockSourceSync) {
        this.log.warn(`Block source is not synced, skipping processing`, proposalInfo);
        return { isValid: false, reason: 'block_source_not_synced' };
      }
    }

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

    // Check that this block number does not exist already
    const existingBlock = await this.blockSource.getBlockHeader(blockNumber);
    if (existingBlock) {
      this.log.warn(`Block number ${blockNumber} already exists, skipping processing`, proposalInfo);
      return { isValid: false, blockNumber, reason: 'block_number_already_exists' };
    }

    // Collect txs from the proposal. We start doing this as early as possible,
    // and we do it even if we don't plan to re-execute the txs, so that we have them if another node needs them.
    const { txs, missingTxs } = await this.txProvider.getTxsForBlockProposal(proposal, blockNumber, {
      pinnedPeer: proposalSender,
      deadline: this.getReexecutionDeadline(slotNumber, config),
    });

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

    // Check that I have the same set of l1ToL2Messages as the proposal
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpointNumber);
    const computedInHash = computeInHashFromL1ToL2Messages(l1ToL2Messages);
    const proposalInHash = proposal.inHash;
    if (!computedInHash.equals(proposalInHash)) {
      this.log.warn(`L1 to L2 messages in hash mismatch, skipping processing`, {
        proposalInHash: proposalInHash.toString(),
        computedInHash: computedInHash.toString(),
        ...proposalInfo,
      });
      return { isValid: false, blockNumber, reason: 'in_hash_mismatch' };
    }

    // Check that all of the transactions in the proposal are available
    if (missingTxs.length > 0) {
      this.log.warn(`Missing ${missingTxs.length} txs to process proposal`, { ...proposalInfo, missingTxs });
      return { isValid: false, blockNumber, reason: 'txs_not_available' };
    }

    // Collect the out hashes of all the checkpoints before this one in the same epoch
    const epoch = getEpochAtSlot(slotNumber, this.epochCache.getL1Constants());
    const previousCheckpointOutHashes = (await this.blockSource.getCheckpointsDataForEpoch(epoch))
      .filter(c => c.checkpointNumber < checkpointNumber)
      .map(c => c.checkpointOutHash);

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
      );
    } catch (error) {
      this.log.error(`Error reexecuting txs while processing block proposal`, error, proposalInfo);
      const reason = this.getReexecuteFailureReason(error);
      return { isValid: false, blockNumber, reason, reexecutionResult };
    }

    // If we succeeded, push this block into the archiver (unless disabled)
    if (reexecutionResult?.block && this.config.skipPushProposedBlocksToArchiver === false) {
      await this.blockSource.addBlock(reexecutionResult.block);
    }

    this.log.info(
      `Successfully re-executed block ${blockNumber} proposal at index ${proposal.indexWithinCheckpoint} on slot ${slotNumber}`,
      { ...proposalInfo, ...pick(reexecutionResult, 'reexecutionTimeMs', 'totalManaUsed') },
    );

    return { isValid: true, blockNumber, reexecutionResult };
  }

  private async getParentBlock(proposal: BlockProposal): Promise<'genesis' | BlockData | undefined> {
    const parentArchive = proposal.blockHeader.lastArchive.root;
    const config = this.checkpointsBuilder.getConfig();
    const { genesisArchiveRoot } = await this.blockSource.getGenesisValues();

    if (parentArchive.equals(genesisArchiveRoot)) {
      return 'genesis';
    }

    const deadline = this.getReexecutionDeadline(proposal.slotNumber, config);
    const currentTime = this.dateProvider.now();
    const timeoutDurationMs = deadline.getTime() - currentTime;

    try {
      return (
        (await this.blockSource.getBlockDataByArchive(parentArchive)) ??
        (timeoutDurationMs <= 0
          ? undefined
          : await retryUntil(
              () => this.blockSource.syncImmediate().then(() => this.blockSource.getBlockDataByArchive(parentArchive)),
              'force archiver sync',
              timeoutDurationMs / 1000,
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

  private getReexecutionDeadline(
    slotNumber: SlotNumber,
    config: { l1GenesisTime: bigint; slotDuration: number },
  ): Date {
    // Under proposer pipelining, the proposal slot may be ahead of wall clock time.
    // Reexecution budgets should still be bounded by the current slot we are in now.
    const wallclockSlot = slotNumber - this.epochCache.pipeliningOffset();
    const nextSlotTimestampSeconds = Number(getTimestampForSlot(SlotNumber(wallclockSlot + 1), config));
    return new Date(nextSlotTimestampSeconds * 1000);
  }

  /** Waits for the block source to sync L1 data up to at least the slot before the given one. */
  private async waitForBlockSourceSync(slot: SlotNumber): Promise<boolean> {
    const deadline = this.getReexecutionDeadline(slot, this.checkpointsBuilder.getConfig());
    const timeoutMs = deadline.getTime() - this.dateProvider.now();
    if (slot === 0) {
      return true;
    }

    // Make a quick check before triggering an archiver sync
    // If we are pipelining and have a pending checkpoint number stored, we will allow the block proposal to be for a slot further
    const syncedSlot = await this.blockSource.getSyncedL2SlotNumber();
    if (syncedSlot !== undefined && syncedSlot + 1 + this.epochCache.pipeliningOffset() >= slot) {
      return true;
    }

    try {
      // Trigger an immediate sync of the block source, and wait until it reports being synced to the required slot
      return await retryUntil(
        async () => {
          await this.blockSource.syncImmediate();
          const updatedSyncedSlot = await this.blockSource.getSyncedL2SlotNumber();
          return updatedSyncedSlot !== undefined && updatedSyncedSlot + 1 >= slot;
        },
        'wait for block source sync',
        timeoutMs / 1000,
        0.5,
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.log.warn(`Timed out waiting for block source to sync to slot ${slot}`);
        return false;
      } else {
        throw err;
      }
    }
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

  async reexecuteTransactions(
    proposal: BlockProposal,
    blockNumber: BlockNumber,
    checkpointNumber: CheckpointNumber,
    txs: Tx[],
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
  ): Promise<ReexecuteTransactionsResult> {
    const { blockHeader, txHashes } = proposal;

    // If we do not have all of the transactions, then we should fail
    if (txs.length !== txHashes.length) {
      const foundTxHashes = txs.map(tx => tx.getTxHash());
      const missingTxHashes = txHashes.filter(txHash => !foundTxHashes.includes(txHash));
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

    // Create checkpoint builder with prior blocks
    const checkpointBuilder = await this.checkpointsBuilder.openCheckpoint(
      checkpointNumber,
      constants,
      0n, // only takes effect in the following checkpoint.
      l1ToL2Messages,
      previousCheckpointOutHashes,
      fork,
      priorBlocks,
      this.log.getBindings(),
    );

    // Build the new block
    const deadline = this.getReexecutionDeadline(slot, config);
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

    // Check cache: same archive+slot means we already validated this proposal
    if (
      this.lastCheckpointValidationResult &&
      this.lastCheckpointValidationResult.archive.equals(proposal.archive) &&
      this.lastCheckpointValidationResult.slotNumber === slot
    ) {
      this.log.debug(`Returning cached validation result for checkpoint proposal at slot ${slot}`, proposalInfo);
      return this.lastCheckpointValidationResult.result;
    }

    const proposer = proposal.getSender();
    if (!proposer) {
      this.log.warn(`Received checkpoint proposal with invalid signature for slot ${proposal.slotNumber}`);
      const result: CheckpointProposalValidationResult = { isValid: false, reason: 'invalid_signature' };
      this.lastCheckpointValidationResult = { archive: proposal.archive, slotNumber: slot, result };
      return result;
    }

    if (!validateFeeAssetPriceModifier(proposal.feeAssetPriceModifier)) {
      this.log.warn(
        `Received checkpoint proposal with invalid feeAssetPriceModifier ${proposal.feeAssetPriceModifier} for slot ${proposal.slotNumber}`,
      );
      const result: CheckpointProposalValidationResult = { isValid: false, reason: 'invalid_fee_asset_price_modifier' };
      this.lastCheckpointValidationResult = { archive: proposal.archive, slotNumber: slot, result };
      return result;
    }

    const result = await this.validateCheckpointProposal(proposal, proposalInfo);
    this.lastCheckpointValidationResult = { archive: proposal.archive, slotNumber: slot, result };

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

    // Timeout block syncing at the start of the next slot
    const config = this.checkpointsBuilder.getConfig();
    const nextSlotTimestampSeconds = Number(getTimestampForSlot(SlotNumber(slot + 1), config));
    const timeoutSeconds = Math.max(1, nextSlotTimestampSeconds - Math.floor(this.dateProvider.now() / 1000));

    // Wait for last block to sync by archive
    let lastBlockHeader;
    try {
      lastBlockHeader = await retryUntil(
        async () => {
          await this.blockSource.syncImmediate();
          return this.blockSource.getBlockHeaderByArchive(proposal.archive);
        },
        `waiting for block with archive ${proposal.archive.toString()} for slot ${slot}`,
        timeoutSeconds,
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

    if (!lastBlockHeader) {
      this.log.warn(`Last block not found for checkpoint proposal`, proposalInfo);
      return { isValid: false, reason: 'last_block_not_found' };
    }

    // Get all full blocks for the slot and checkpoint
    const blocks = await this.blockSource.getBlocksForSlot(slot);
    if (blocks.length === 0) {
      this.log.warn(`No blocks found for slot ${slot}`, proposalInfo);
      return { isValid: false, reason: 'no_blocks_for_slot' };
    }

    // Ensure the last block for this slot matches the archive in the checkpoint proposal
    if (!blocks.at(-1)?.archive.root.equals(proposal.archive)) {
      this.log.warn(`Last block archive mismatch for checkpoint proposal`, proposalInfo);
      return { isValid: false, reason: 'last_block_archive_mismatch' };
    }

    this.log.debug(`Found ${blocks.length} blocks for slot ${slot}`, {
      ...proposalInfo,
      blockNumbers: blocks.map(b => b.number),
    });

    // Get checkpoint constants from first block
    const firstBlock = blocks[0];
    const constants = this.extractCheckpointConstants(firstBlock);
    const checkpointNumber = firstBlock.checkpointNumber;

    // Get L1-to-L2 messages for this checkpoint
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpointNumber);

    // Collect the out hashes of all the checkpoints before this one in the same epoch
    const epoch = getEpochAtSlot(slot, this.epochCache.getL1Constants());
    const previousCheckpointOutHashes = (await this.blockSource.getCheckpointsDataForEpoch(epoch))
      .filter(c => c.checkpointNumber < checkpointNumber)
      .map(c => c.checkpointOutHash);

    // Fork world state at the block before the first block
    const parentBlockNumber = BlockNumber(firstBlock.number - 1);
    await using fork = await this.checkpointsBuilder.getFork(parentBlockNumber);

    // Create checkpoint builder with all existing blocks
    const checkpointBuilder = await this.checkpointsBuilder.openCheckpoint(
      checkpointNumber,
      constants,
      proposal.feeAssetPriceModifier,
      l1ToL2Messages,
      previousCheckpointOutHashes,
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
      return { isValid: false, reason: 'checkpoint_header_mismatch' };
    }

    // Compare archive root with proposal
    if (!computedCheckpoint.archive.root.equals(proposal.archive)) {
      this.log.warn(`Archive root mismatch`, {
        ...proposalInfo,
        computed: computedCheckpoint.archive.root.toString(),
        proposal: proposal.archive.toString(),
      });
      return { isValid: false, reason: 'archive_mismatch' };
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
      return { isValid: false, reason: 'out_hash_mismatch' };
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
      return { isValid: false, reason: 'checkpoint_validation_failed' };
    }

    this.log.verbose(`Checkpoint proposal validation successful for slot ${slot}`, proposalInfo);
    return { isValid: true };
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
      const lastBlockHeader = await this.blockSource.getBlockHeaderByArchive(proposal.archive);
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
   * Derives proposed checkpoint data from validated blocks and sets it on the archiver.
   * Used after successful validation of a foreign proposal.
   * Does not retry since we already waited for the block during validation.
   */
  private async setProposedCheckpointFromValidation(proposal: CheckpointProposalCore): Promise<boolean> {
    if (!this.archiver) {
      return false;
    }
    const blockData = await this.blockSource.getBlockDataByArchive(proposal.archive);
    if (!blockData) {
      this.log.debug(`Block data not found for checkpoint proposal archive, cannot set proposed checkpoint`, {
        archive: proposal.archive.toString(),
      });
      return false;
    }

    await this.archiver.setProposedCheckpoint({
      header: proposal.checkpointHeader,
      checkpointNumber: blockData.checkpointNumber,
      startBlock: BlockNumber(blockData.header.getBlockNumber() - blockData.indexWithinCheckpoint),
      blockCount: blockData.indexWithinCheckpoint + 1,
      totalManaUsed: proposal.checkpointHeader.totalManaUsed.toBigInt(),
      feeAssetPriceModifier: proposal.feeAssetPriceModifier,
    });
    return true;
  }

  /**
   * Sets proposed checkpoint from blocks for own proposals (skips full validation).
   * Retries fetching block data since the checkpoint proposal often arrives before the last block
   * finishes re-execution.
   */
  private async setProposedCheckpointFromBlocks(proposal: CheckpointProposalCore): Promise<boolean> {
    if (!this.archiver) {
      return false;
    }
    let blockData = await this.blockSource.getBlockDataByArchive(proposal.archive);

    if (!blockData) {
      // The checkpoint proposal often arrives before the last block finishes re-execution.
      // Retry until we find the data or give up at the end of the slot.
      const nextSlot = this.epochCache.getSlotNow() + 1;
      const timeOfNextSlot = getTimestampForSlot(SlotNumber(nextSlot), await this.archiver.getL1Constants());
      const timeoutSeconds = Math.max(1, Number(timeOfNextSlot) - Math.floor(this.dateProvider.now() / 1000));

      blockData = await retryUntil(
        () => this.blockSource.getBlockDataByArchive(proposal.archive),
        'block data for own checkpoint proposal',
        timeoutSeconds,
        0.25,
      ).catch(() => undefined);
    }

    if (blockData) {
      await this.archiver.setProposedCheckpoint({
        header: proposal.checkpointHeader,
        checkpointNumber: blockData.checkpointNumber,
        startBlock: BlockNumber(blockData.header.getBlockNumber() - blockData.indexWithinCheckpoint),
        blockCount: blockData.indexWithinCheckpoint + 1,
        totalManaUsed: proposal.checkpointHeader.totalManaUsed.toBigInt(),
        feeAssetPriceModifier: proposal.feeAssetPriceModifier,
      });
      return true;
    } else {
      this.log.debug(`Block data not found for own checkpoint proposal archive, cannot set proposed checkpoint`, {
        archive: proposal.archive.toString(),
      });
      return false;
    }
  }
}
