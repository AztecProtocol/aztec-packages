import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import { TxProvider } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import type { L2BlockNew, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { BlockHeader, type CheckpointGlobalVariables, type FailedTx, type Tx } from '@aztec/stdlib/tx';
import {
  ReExFailedTxsError,
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
  | 'parent_block_wrong_slot'
  | 'in_hash_mismatch'
  | 'global_variables_mismatch'
  | 'block_number_already_exists'
  | 'txs_not_available'
  | 'state_mismatch'
  | 'failed_txs'
  | 'timeout'
  | 'unknown_error';

type ReexecuteTransactionsResult = {
  block: L2BlockNew;
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

type CheckpointComputationResult =
  | { checkpointNumber: CheckpointNumber; reason?: undefined }
  | { checkpointNumber?: undefined; reason: 'invalid_proposal' | 'global_variables_mismatch' };

export class BlockProposalHandler {
  public readonly tracer: Tracer;

  constructor(
    private checkpointsBuilder: FullNodeCheckpointsBuilder,
    private worldState: WorldStateSynchronizer,
    private blockSource: L2BlockSource & L2BlockSink,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private txProvider: TxProvider,
    private blockProposalValidator: BlockProposalValidator,
    private config: ValidatorClientFullConfig,
    private metrics?: ValidatorMetrics,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('validator:block-proposal-handler'),
  ) {
    if (config.fishermanMode) {
      this.log = this.log.createChild('[FISHERMAN]');
    }
    this.tracer = telemetry.getTracer('BlockProposalHandler');
  }

  registerForReexecution(p2pClient: P2P): BlockProposalHandler {
    // Non-validator handler that re-executes for monitoring but does not attest.
    // Returns boolean indicating whether the proposal was valid.
    const handler = async (proposal: BlockProposal, proposalSender: PeerId): Promise<boolean> => {
      try {
        const result = await this.handleBlockProposal(proposal, proposalSender, true);
        if (result.isValid) {
          this.log.info(`Non-validator reexecution completed for slot ${proposal.slotNumber}`, {
            blockNumber: result.blockNumber,
            reexecutionTimeMs: result.reexecutionResult?.reexecutionTimeMs,
            totalManaUsed: result.reexecutionResult?.totalManaUsed,
            numTxs: result.reexecutionResult?.block?.body?.txEffects?.length ?? 0,
          });
          return true;
        } else {
          this.log.warn(`Non-validator reexecution failed for slot ${proposal.slotNumber}`, {
            blockNumber: result.blockNumber,
            reason: result.reason,
          });
          return false;
        }
      } catch (error) {
        this.log.error('Error processing block proposal in non-validator handler', error);
        return false;
      }
    };

    p2pClient.registerBlockProposalHandler(handler);
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

    const proposalInfo = { ...proposal.toBlockInfo(), proposer: proposer.toString() };
    this.log.info(`Processing proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(t => t.toString()),
    });

    // Check that the proposal is from the current proposer, or the next proposer
    // This should have been handled by the p2p layer, but we double check here out of caution
    const invalidProposal = await this.blockProposalValidator.validate(proposal);
    if (invalidProposal) {
      this.log.warn(`Proposal is not valid, skipping processing`, proposalInfo);
      return { isValid: false, reason: 'invalid_proposal' };
    }

    // Check that the parent proposal is a block we know, otherwise reexecution would fail
    const parentBlockHeader = await this.getParentBlock(proposal);
    if (parentBlockHeader === undefined) {
      this.log.warn(`Parent block for proposal not found, skipping processing`, proposalInfo);
      return { isValid: false, reason: 'parent_block_not_found' };
    }

    // Check that the parent block's slot is less than the proposal's slot (should not happen, but we check anyway)
    if (parentBlockHeader !== 'genesis' && parentBlockHeader.getSlot() >= slotNumber) {
      this.log.warn(`Parent block slot is greater than or equal to proposal slot, skipping processing`, {
        parentBlockSlot: parentBlockHeader.getSlot().toString(),
        proposalSlot: slotNumber.toString(),
        ...proposalInfo,
      });
      return { isValid: false, reason: 'parent_block_wrong_slot' };
    }

    // Compute the block number based on the parent block
    const blockNumber =
      parentBlockHeader === 'genesis'
        ? BlockNumber(INITIAL_L2_BLOCK_NUM)
        : BlockNumber(parentBlockHeader.getBlockNumber() + 1);

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

    // Compute the checkpoint number for this block and validate checkpoint consistency
    const checkpointResult = await this.computeCheckpointNumber(proposal, parentBlockHeader, proposalInfo);
    if (checkpointResult.reason) {
      return { isValid: false, blockNumber, reason: checkpointResult.reason };
    }
    const checkpointNumber = checkpointResult.checkpointNumber;

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

    // Try re-executing the transactions in the proposal if needed
    let reexecutionResult;
    if (shouldReexecute) {
      try {
        this.log.verbose(`Re-executing transactions in the proposal`, proposalInfo);
        reexecutionResult = await this.reexecuteTransactions(
          proposal,
          blockNumber,
          checkpointNumber,
          txs,
          l1ToL2Messages,
        );
      } catch (error) {
        this.log.error(`Error reexecuting txs while processing block proposal`, error, proposalInfo);
        const reason = this.getReexecuteFailureReason(error);
        return { isValid: false, blockNumber, reason, reexecutionResult };
      }
    }

    // If we succeeded, push this block into the archiver (unless disabled)
    // TODO(palla/mbps): Change default to false once block sync is stable.
    if (reexecutionResult?.block && this.config.skipPushProposedBlocksToArchiver === false) {
      await this.blockSource.addBlock(reexecutionResult?.block);
    }

    this.log.info(
      `Successfully processed block ${blockNumber} proposal at index ${proposal.indexWithinCheckpoint} on slot ${slotNumber}`,
      proposalInfo,
    );

    return { isValid: true, blockNumber, reexecutionResult };
  }

  private async getParentBlock(proposal: BlockProposal): Promise<'genesis' | BlockHeader | undefined> {
    const parentArchive = proposal.blockHeader.lastArchive.root;
    const slot = proposal.slotNumber;
    const config = this.checkpointsBuilder.getConfig();
    const { genesisArchiveRoot } = await this.blockSource.getGenesisValues();

    if (parentArchive.equals(genesisArchiveRoot)) {
      return 'genesis';
    }

    const deadline = this.getReexecutionDeadline(slot, config);
    const currentTime = this.dateProvider.now();
    const timeoutDurationMs = deadline.getTime() - currentTime;

    try {
      return (
        (await this.blockSource.getBlockHeaderByArchive(parentArchive)) ??
        (timeoutDurationMs <= 0
          ? undefined
          : await retryUntil(
              () =>
                this.blockSource.syncImmediate().then(() => this.blockSource.getBlockHeaderByArchive(parentArchive)),
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

  private async computeCheckpointNumber(
    proposal: BlockProposal,
    parentBlockHeader: 'genesis' | BlockHeader,
    proposalInfo: object,
  ): Promise<CheckpointComputationResult> {
    if (parentBlockHeader === 'genesis') {
      // First block is in checkpoint 1
      if (proposal.indexWithinCheckpoint !== 0) {
        this.log.warn(`First block proposal has non-zero indexWithinCheckpoint`, proposalInfo);
        return { reason: 'invalid_proposal' };
      }
      return { checkpointNumber: CheckpointNumber.INITIAL };
    }

    // Get the parent block to find its checkpoint number
    // TODO(palla/mbps): The block header should include the checkpoint number to avoid this lookup,
    // or at least the L2BlockSource should return a different struct that includes it.
    const parentBlockNumber = parentBlockHeader.getBlockNumber();
    const parentBlock = await this.blockSource.getL2BlockNew(parentBlockNumber);
    if (!parentBlock) {
      this.log.warn(`Parent block ${parentBlockNumber} not found in archiver`, proposalInfo);
      return { reason: 'invalid_proposal' };
    }

    if (proposal.indexWithinCheckpoint === 0) {
      // If this is the first block in a new checkpoint, increment the checkpoint number
      if (!(proposal.blockHeader.getSlot() > parentBlockHeader.getSlot())) {
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
    if (proposal.blockHeader.getSlot() !== parentBlockHeader.getSlot()) {
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
    parentBlock: L2BlockNew,
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

  private getReexecutionDeadline(slot: SlotNumber, config: { l1GenesisTime: bigint; slotDuration: number }): Date {
    const nextSlotTimestampSeconds = Number(getTimestampForSlot(SlotNumber(slot + 1), config));
    return new Date(nextSlotTimestampSeconds * 1000);
  }

  /**
   * Gets all prior blocks in the same checkpoint (same slot and checkpoint number) up to but not including upToBlockNumber.
   */
  private async getBlocksInCheckpoint(
    slot: SlotNumber,
    upToBlockNumber: BlockNumber,
    checkpointNumber: CheckpointNumber,
  ): Promise<L2BlockNew[]> {
    const blocks: L2BlockNew[] = [];
    let currentBlockNumber = BlockNumber(upToBlockNumber - 1);

    while (currentBlockNumber >= INITIAL_L2_BLOCK_NUM) {
      const block = await this.blockSource.getL2BlockNew(currentBlockNumber);
      if (!block || block.header.getSlot() !== slot || block.checkpointNumber !== checkpointNumber) {
        break;
      }
      blocks.unshift(block);
      currentBlockNumber = BlockNumber(currentBlockNumber - 1);
    }

    return blocks;
  }

  private getReexecuteFailureReason(err: any) {
    if (err instanceof ReExStateMismatchError) {
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

    // Get prior blocks in this checkpoint (same slot and checkpoint number)
    const priorBlocks = await this.getBlocksInCheckpoint(slot, blockNumber, checkpointNumber);

    // Fork before the block to be built
    const parentBlockNumber = BlockNumber(blockNumber - 1);
    using fork = await this.worldState.fork(parentBlockNumber);

    // Build checkpoint constants from proposal (excludes blockNumber and timestamp which are per-block)
    const constants: CheckpointGlobalVariables = {
      chainId: new Fr(config.l1ChainId),
      version: new Fr(config.rollupVersion),
      slotNumber: slot,
      coinbase: blockHeader.globalVariables.coinbase,
      feeRecipient: blockHeader.globalVariables.feeRecipient,
      gasFees: blockHeader.globalVariables.gasFees,
    };

    // Create checkpoint builder with prior blocks
    const checkpointBuilder = await this.checkpointsBuilder.openCheckpoint(
      checkpointNumber,
      constants,
      l1ToL2Messages,
      fork,
      priorBlocks,
    );

    // Build the new block
    const deadline = this.getReexecutionDeadline(slot, config);
    const result = await checkpointBuilder.buildBlock(txs, blockNumber, blockHeader.globalVariables.timestamp, {
      deadline,
      expectedEndState: blockHeader.state,
    });

    const { block, failedTxs } = result;
    const numFailedTxs = failedTxs.length;

    this.log.verbose(`Transaction re-execution complete for slot ${slot}`, {
      numFailedTxs,
      numProposalTxs: txHashes.length,
      numProcessedTxs: block.body.txEffects.length,
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
}
