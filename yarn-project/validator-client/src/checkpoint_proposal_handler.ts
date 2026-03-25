import type { Archiver } from '@aztec/archiver';
import type { EpochCache } from '@aztec/epoch-cache';
import { validateFeeAssetPriceModifier } from '@aztec/ethereum/contracts';
import { BlockNumber, type CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { type LogData, type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import type { L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { validateCheckpoint } from '@aztec/stdlib/checkpoint';
import { getEpochAtSlot, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { ValidatorClientFullConfig } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, accumulateCheckpointOutHashes } from '@aztec/stdlib/messaging';
import type { CheckpointAttestation, CheckpointProposalCore } from '@aztec/stdlib/p2p';
import type { CheckpointGlobalVariables } from '@aztec/stdlib/tx';

import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';

export type CheckpointProposalValidationFailureReason =
  | 'invalid_proposal'
  | 'last_block_not_found'
  | 'no_blocks_for_slot'
  | 'last_block_archive_mismatch'
  | 'checkpoint_header_mismatch'
  | 'archive_mismatch'
  | 'out_hash_mismatch'
  | 'checkpoint_validation_failed'
  | 'block_fetch_error'
  | 'unknown_error';

export type CheckpointProposalValidationSuccessResult = {
  isValid: true;
  checkpointNumber: CheckpointNumber;
};

export type CheckpointProposalValidationFailureResult = {
  isValid: false;
  reason: CheckpointProposalValidationFailureReason;
};

export type CheckpointProposalValidationResult =
  | CheckpointProposalValidationSuccessResult
  | CheckpointProposalValidationFailureResult;

/**
 * Handles checkpoint proposals for all nodes (validators and non-validators).
 * Validates checkpoint proposals by rebuilding the checkpoint header from blocks
 * already in the archiver and comparing against the proposal.
 * Mirrors the BlockProposalHandler pattern.
 */
export class CheckpointProposalHandler {
  /** Cached last validation result to avoid double-validation on validator nodes. */
  private lastValidationResult?: {
    archive: Fr;
    slotNumber: SlotNumber;
    result: CheckpointProposalValidationResult;
  };

  constructor(
    private checkpointsBuilder: FullNodeCheckpointsBuilder,
    private blockSource: L2BlockSource & L2BlockSink,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private epochCache: EpochCache,
    private config: ValidatorClientFullConfig,
    private dateProvider: DateProvider = new DateProvider(),
    private log: Logger = createLogger('validator:checkpoint-proposal-handler'),
  ) {}

  /**
   * Registers this handler on the p2p client as the all-nodes checkpoint proposal handler.
   * On valid proposals with pipelining enabled, sets the proposed checkpoint on the archiver.
   * For own proposals (matching validator addresses), skips validation since the proposer already validated.
   * @param getOwnValidatorAddresses - A function that returns current validator addresses (called per proposal
   *   to pick up keystore reloads).
   */
  register(
    p2pClient: P2P,
    archiver: Pick<Archiver, 'setProposedCheckpoint' | 'getL1Constants'>,
    getOwnValidatorAddresses?: () => string[],
  ): CheckpointProposalHandler {
    const handler = async (
      proposal: CheckpointProposalCore,
      _sender: PeerId,
    ): Promise<CheckpointAttestation[] | undefined> => {
      try {
        // For own proposals, skip validation — the proposer already built and validated the checkpoint
        const proposer = proposal.getSender();
        const ownAddresses = getOwnValidatorAddresses?.();
        const isOwnProposal = proposer && ownAddresses?.some(addr => addr === proposer.toString());

        if (isOwnProposal) {
          this.log.debug(`Skipping validation for own checkpoint proposal at slot ${proposal.slotNumber}`);
          if (this.epochCache.isProposerPipeliningEnabled()) {
            await this.setProposedCheckpointFromBlocks(proposal, archiver);
          }
          return undefined;
        }

        const result = await this.handleCheckpointProposal(proposal);
        if (result.isValid && this.epochCache.isProposerPipeliningEnabled()) {
          await this.setProposedCheckpointFromValidation(proposal, result.checkpointNumber, archiver);
        }
      } catch (err) {
        this.log.warn(`Error handling checkpoint proposal for slot ${proposal.slotNumber}`, { err });
      }
      return undefined;
    };

    p2pClient.registerAllNodesCheckpointProposalHandler(handler);
    return this;
  }

  /**
   * Validates a checkpoint proposal by rebuilding the checkpoint header from blocks in the archiver.
   * Returns a cached result if the same proposal was already validated (avoids double work on validator nodes).
   */
  async handleCheckpointProposal(proposal: CheckpointProposalCore): Promise<CheckpointProposalValidationResult> {
    const slot = proposal.slotNumber;
    const proposalInfo: LogData = {
      slot,
      archive: proposal.archive.toString(),
      proposer: proposal.getSender()?.toString(),
    };

    // Check cache: same archive+slot means we already validated this proposal
    if (
      this.lastValidationResult &&
      this.lastValidationResult.archive.equals(proposal.archive) &&
      this.lastValidationResult.slotNumber === slot
    ) {
      this.log.debug(`Returning cached validation result for checkpoint proposal at slot ${slot}`, proposalInfo);
      return this.lastValidationResult.result;
    }

    const result = await this.validateCheckpointProposal(proposal, proposalInfo);
    this.lastValidationResult = { archive: proposal.archive, slotNumber: slot, result };
    return result;
  }

  private async validateCheckpointProposal(
    proposal: CheckpointProposalCore,
    proposalInfo: LogData,
  ): Promise<CheckpointProposalValidationResult> {
    const slot = proposal.slotNumber;

    // Validate proposer signature
    const proposer = proposal.getSender();
    if (!proposer) {
      this.log.warn(`Received checkpoint proposal with invalid signature for slot ${slot}`, proposalInfo);
      return { isValid: false, reason: 'invalid_proposal' };
    }

    // Validate fee asset price modifier
    if (!validateFeeAssetPriceModifier(proposal.feeAssetPriceModifier)) {
      this.log.warn(
        `Received checkpoint proposal with invalid feeAssetPriceModifier ${proposal.feeAssetPriceModifier} for slot ${slot}`,
        proposalInfo,
      );
      return { isValid: false, reason: 'invalid_proposal' };
    }

    // Compute timeout at the start of the next slot
    const config = this.checkpointsBuilder.getConfig();
    const nextSlotTimestampSeconds = Number(getTimestampForSlot(SlotNumber(slot + 1), config));
    const timeoutSeconds = Math.max(1, nextSlotTimestampSeconds - Math.floor(this.dateProvider.now() / 1000));

    // Wait for last block to sync by archive root
    try {
      const lastBlockHeader = await retryUntil(
        async () => {
          await this.blockSource.syncImmediate();
          return this.blockSource.getBlockHeaderByArchive(proposal.archive);
        },
        `waiting for block with archive ${proposal.archive.toString()} for slot ${slot}`,
        timeoutSeconds,
        0.5,
      );

      if (!lastBlockHeader) {
        this.log.warn(`Last block not found for checkpoint proposal`, proposalInfo);
        return { isValid: false, reason: 'last_block_not_found' };
      }
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.log.warn(`Timed out waiting for block with archive matching checkpoint proposal`, proposalInfo);
        return { isValid: false, reason: 'last_block_not_found' };
      }
      this.log.error(`Error fetching last block for checkpoint proposal`, err, proposalInfo);
      return { isValid: false, reason: 'block_fetch_error' };
    }

    // Get all full blocks for the slot
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
    const constants = extractCheckpointConstants(firstBlock);
    const checkpointNumber = firstBlock.checkpointNumber;

    // Get L1-to-L2 messages for this checkpoint
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpointNumber);

    // Collect the out hashes of all the checkpoints before this one in the same epoch
    const epoch = getEpochAtSlot(slot, this.epochCache.getL1Constants());
    const previousCheckpointOutHashes = (await this.blockSource.getCheckpointsDataForEpoch(epoch))
      .filter(c => c.checkpointNumber < checkpointNumber)
      .map(c => c.checkpointOutHash);

    // Fork world state at the block before the first block.
    // Note: openCheckpoint reads initial state reference and archive from the fork,
    // but resumeCheckpoint (used when existingBlocks is provided) does not modify it.
    const parentBlockNumber = BlockNumber(firstBlock.number - 1);
    const fork = await this.checkpointsBuilder.getFork(parentBlockNumber);

    try {
      // Create checkpoint builder with all existing blocks and complete to get computed values
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

      // Check that the accumulated epoch out hash matches the value in the proposal
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

      // Final round of validations on the checkpoint
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
      return { isValid: true, checkpointNumber };
    } finally {
      await fork.close();
    }
  }

  /**
   * Derives proposed checkpoint data from validated blocks and sets it on the archiver.
   * Used after successful validation of a foreign proposal.
   *
   * Note: we do not retry in this function as we wait for the last block already as part of validateCheckpointProposal
   */
  private async setProposedCheckpointFromValidation(
    proposal: CheckpointProposalCore,
    checkpointNumber: CheckpointNumber,
    archiver: Pick<Archiver, 'setProposedCheckpoint'>,
  ): Promise<void> {
    const blockData = await this.blockSource.getBlockDataByArchive(proposal.archive);
    if (!blockData) {
      this.log.debug(`Block data not found for checkpoint proposal archive, cannot set proposed checkpoint`, {
        archive: proposal.archive.toString(),
      });
      return;
    }

    await archiver.setProposedCheckpoint({
      header: proposal.checkpointHeader,
      checkpointNumber,
      startBlock: BlockNumber(blockData.header.getBlockNumber() - blockData.indexWithinCheckpoint),
      blockCount: blockData.indexWithinCheckpoint + 1,
      totalManaUsed: proposal.checkpointHeader.totalManaUsed.toBigInt(),
      feeAssetPriceModifier: proposal.feeAssetPriceModifier,
    });
  }

  /**
   * Sets proposed checkpoint from blocks for own proposals (skips full validation).
   * Waits for block data to appear in the archiver with a retry loop.
   */
  private async setProposedCheckpointFromBlocks(
    proposal: CheckpointProposalCore,
    archiver: Pick<Archiver, 'setProposedCheckpoint' | 'getL1Constants'>,
  ): Promise<void> {
    let blockData = await this.blockSource.getBlockDataByArchive(proposal.archive);

    if (!blockData) {
      // The checkpoint proposal often arrives before the last block finishes re-execution.
      // Retry until we find the data or give up at the end of the slot.
      const nextSlot = this.epochCache.getSlotNow() + 1;
      const timeOfNextSlot = getTimestampForSlot(SlotNumber(nextSlot), await archiver.getL1Constants());
      const timeoutSeconds = Math.max(1, Number(timeOfNextSlot) - Math.floor(Date.now() / 1000));

      blockData = await retryUntil(
        () => this.blockSource.getBlockDataByArchive(proposal.archive),
        'block data for own checkpoint proposal',
        timeoutSeconds,
        0.25,
      ).catch(() => undefined);
    }

    if (blockData) {
      await archiver.setProposedCheckpoint({
        header: proposal.checkpointHeader,
        checkpointNumber: blockData.checkpointNumber,
        startBlock: BlockNumber(blockData.header.getBlockNumber() - blockData.indexWithinCheckpoint),
        blockCount: blockData.indexWithinCheckpoint + 1,
        totalManaUsed: proposal.checkpointHeader.totalManaUsed.toBigInt(),
        feeAssetPriceModifier: proposal.feeAssetPriceModifier,
      });
    } else {
      this.log.debug(`Block data not found for own checkpoint proposal archive, cannot set proposed checkpoint`, {
        archive: proposal.archive.toString(),
      });
    }
  }
}

/** Extract checkpoint global variables from a block. */
export function extractCheckpointConstants(block: L2Block): CheckpointGlobalVariables {
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
