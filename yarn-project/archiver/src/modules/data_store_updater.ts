import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { filterAsync } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import {
  ContractInstancePublishedEvent,
  ContractInstanceUpdatedEvent,
} from '@aztec/protocol-contracts/instance-registry';
import type { BlockData, CommitteeAttestation, L2Block, ValidateCheckpointResult } from '@aztec/stdlib/block';
import {
  type L1PublishedData,
  type ProposedCheckpointInput,
  type PublishedCheckpoint,
  validateCheckpoint,
} from '@aztec/stdlib/checkpoint';
import {
  type ContractClassPublicWithCommitment,
  computeContractAddressFromInstance,
  computeContractClassId,
} from '@aztec/stdlib/contract';
import type { ContractClassLog, PrivateLog, PublicLog } from '@aztec/stdlib/logs';
import type { InboxMessagePosition, InboxMessagePrefixRef } from '@aztec/stdlib/messaging';
import type { UInt64 } from '@aztec/stdlib/types';

import {
  InboxConsumptionRewindsError,
  InboxMessagePrefixChangedError,
  InboxPrefixMismatchError,
  InboxPrefixNotSyncedError,
  ProposedBlockParentNotFoundError,
} from '../errors.js';
import type { ArchiverDataStores } from '../store/data_stores.js';
import type { L2TipsCache } from '../store/l2_tips_cache.js';
import type { MessageSyncState } from '../store/message_store.js';
import type { InboxMessage } from '../structs/inbox_message.js';

/** Operation type for contract data updates. */
enum Operation {
  Store,
  Delete,
}

/**
 * A block's L1-to-L2 message tree leaf count: the cumulative Inbox message count consumed through it. Messages are
 * indexed compactly with no padding, so the leaf count is exactly the length of the message prefix the block consumed.
 */
export function blockLeafCount(block: Pick<L2Block, 'header'> | BlockData): bigint {
  return BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
}

/** Result of adding checkpoints with information about any pruned blocks. */
type ReconcileCheckpointsResult = {
  /** Blocks that were pruned due to conflict with L1 checkpoints. */
  prunedBlocks: L2Block[] | undefined;
  /** Last block number that was already inserted locally, or undefined if none. */
  lastAlreadyInsertedBlockNumber: BlockNumber | undefined;
};

/** Outcome of an Inbox message suffix replacement. */
export type MessageSuffixReplacementResult = {
  /** Uncheckpointed blocks pruned because they consumed a replaced or removed message. */
  prunedBlocks: L2Block[];
  /** Whether the checkpointed tip itself consumed a replaced or removed message; published blocks are left to L1 sync. */
  checkpointedTipAffected: boolean;
};

/** Archiver helper module to handle updates to the data store. */
export class ArchiverDataStoreUpdater {
  private readonly log = createLogger('archiver:store_updater');

  constructor(
    private stores: ArchiverDataStores,
    private l2TipsCache?: L2TipsCache,
    private opts: { rollupManaLimit?: number } = {},
  ) {}

  /**
   * Adds a proposed block to the store with contract class/instance extraction from logs.
   * This is an uncheckpointed block that has been proposed by the sequencer but not yet included in a checkpoint on L1.
   * Extracts ContractClassPublished, ContractInstancePublished, ContractInstanceUpdated events from the block logs.
   *
   * The block's signed Inbox prefix reference is validated against the canonical messages this store holds *inside
   * the same transaction as the writes*. A block built before an L1 reorg replaced the messages it consumed could
   * otherwise be inserted after the reorg had already pruned the chain it belongs to, landing on the parent that
   * survived the prune with nothing left to remove it. Because message replacement and this insertion each run as one
   * transaction on the same store, the two orderings converge: a replacement that commits first makes this validation
   * fail, and an insertion that commits first is visible to the replacement's prune.
   *
   * @param block - The proposed L2 block to add.
   * @param inboxPrefixRef - The signed Inbox prefix reference the block was built or validated against.
   * @param pendingChainValidationStatus - Optional validation status to set.
   * @returns True if the operation is successful.
   * @throws InboxPrefixNotSyncedError, InboxPrefixMismatchError, ProposedBlockParentNotFoundError or
   *   InboxConsumptionRewindsError when the reference does not check out; nothing is written in that case.
   */
  public async addProposedBlock(
    block: L2Block,
    inboxPrefixRef: InboxMessagePrefixRef,
    pendingChainValidationStatus?: ValidateCheckpointResult,
  ): Promise<boolean> {
    const result = await this.stores.db.transactionAsync(async () => {
      // The block store's own chain checks (sequential number, parent archive) run first so a structurally invalid
      // block keeps its error. The prefix validation follows inside the same transaction, before logs and contract
      // data are written: a rejection aborts the whole callback and leaves the store exactly as it was.
      await this.stores.blocks.addProposedBlock(block);
      await this.validateProposedBlockInboxPrefix(block, inboxPrefixRef);

      const opResults = await Promise.all([
        // Update the pending chain validation status if provided
        pendingChainValidationStatus &&
          this.stores.blocks.setPendingChainValidationStatus(pendingChainValidationStatus),
        // Add any logs emitted during the retrieved block
        this.stores.logs.addLogs([block]),
        // Unroll all logs emitted during the retrieved block and extract any contract classes and instances from it
        this.addContractDataToDb(block),
      ]);

      return opResults.every(Boolean);
    });
    await this.l2TipsCache?.refresh();
    return result;
  }

  /**
   * Checks a proposed block's signed Inbox prefix reference against the canonical messages this store holds, and
   * that the exact range it consumed is available whole.
   *
   * The block's end count comes from its own signed header's L1-to-L2 leaf count and the start from its stored
   * parent's. The range and the position it ends at are read from one store snapshot, so the hash compared against
   * the reference is the hash over exactly the leaves the range holds. Because each message's rolling hash chains the
   * one before it, a matching hash at the end count proves the proposer consumed exactly the prefix this store holds,
   * which makes the range between the two counts canonical by content.
   *
   * Deliberately absent is any requirement that either count sit on a boundary of the L1 bucket partition: blocks
   * consume arbitrary message prefixes, and an L1 reorg that re-mines the same messages under different boundaries
   * leaves every leaf and prefix hash intact.
   *
   * Must run inside the transaction that writes the block.
   */
  private async validateProposedBlockInboxPrefix(block: L2Block, inboxPrefixRef: InboxMessagePrefixRef): Promise<void> {
    const blockNumber = block.number;
    const endCount = blockLeafCount(block);
    const parentCount = await this.getParentBlockLeafCount(block);
    if (endCount < parentCount) {
      throw new InboxConsumptionRewindsError(blockNumber, endCount, parentCount);
    }

    let endRollingHash;
    try {
      ({
        end: { rollingHash: endRollingHash },
      } = await this.stores.messages.getL1ToL2MessageRange(parentCount, endCount));
    } catch (err) {
      throw new InboxPrefixNotSyncedError(blockNumber, endCount, `${err}`);
    }
    if (!endRollingHash.equals(inboxPrefixRef.inboxRollingHash)) {
      throw new InboxPrefixMismatchError(blockNumber, endCount, inboxPrefixRef.inboxRollingHash, endRollingHash);
    }
  }

  /**
   * The cumulative Inbox message count consumed through a proposed block's parent: its L1-to-L2 tree leaf count, or
   * zero when the block is the first of the chain. Throws when the parent is not in the store, since its consumed
   * range would then have no lower bound. Must run inside the caller's transaction.
   */
  private async getParentBlockLeafCount(block: L2Block): Promise<bigint> {
    const parentBlockNumber = block.number - 1;
    if (parentBlockNumber < INITIAL_L2_BLOCK_NUM) {
      return 0n;
    }
    const parent = await this.stores.blocks.getBlockData({ number: BlockNumber(parentBlockNumber) });
    if (parent === undefined) {
      throw new ProposedBlockParentNotFoundError(block.number, parentBlockNumber);
    }
    return blockLeafCount(parent);
  }

  /**
   * Reconciles local blocks with incoming checkpoints from L1.
   * Adds new checkpoints to the store with contract class/instance extraction from logs.
   * Prunes any local blocks that conflict with checkpoint data (by comparing archive roots).
   * Extracts ContractClassPublished, ContractInstancePublished, ContractInstanceUpdated events from the checkpoint block logs.
   * If `promoteProposed` is supplied, the proposed-checkpoint promotion runs inside the same transaction
   * as the added checkpoints so both updates are applied atomically.
   *
   * @param checkpoints - The published checkpoints to add (excluding any being promoted from proposed).
   * @param pendingChainValidationStatus - Optional validation status to set.
   * @param promoteProposed - Optional promotion of the current proposed checkpoint (fast path when blocks are already local).
   * @returns Result with information about any pruned blocks.
   */
  public async addCheckpoints(
    checkpoints: PublishedCheckpoint[],
    pendingChainValidationStatus?: ValidateCheckpointResult,
    promoteProposed?: {
      l1: L1PublishedData;
      attestations: CommitteeAttestation[];
      checkpoint: PublishedCheckpoint;
    },
    evictProposedFrom?: CheckpointNumber,
  ): Promise<ReconcileCheckpointsResult> {
    const validateOpts = { rollupManaLimit: this.opts?.rollupManaLimit };
    for (const checkpoint of checkpoints) {
      validateCheckpoint(checkpoint.checkpoint, validateOpts);
    }
    if (promoteProposed) {
      validateCheckpoint(promoteProposed.checkpoint.checkpoint, validateOpts);
    }

    const result = await this.stores.db.transactionAsync(async () => {
      // Before adding checkpoints, check for conflicts with local blocks if any
      const { prunedBlocks, lastAlreadyInsertedBlockNumber } = await this.pruneMismatchingLocalBlocks(checkpoints);

      const insertedCheckpoints = await this.stores.blocks.addCheckpoints(checkpoints);

      // Skip blocks already inserted via addProposedBlock() and blocks of already-stored checkpoints
      // re-included by an L1 reorg: their logs/contract data were extracted when first inserted.
      const newBlocks = insertedCheckpoints
        .flatMap((ch: PublishedCheckpoint) => ch.checkpoint.blocks)
        .filter(b => lastAlreadyInsertedBlockNumber === undefined || b.number > lastAlreadyInsertedBlockNumber);

      await Promise.all([
        // Update the pending chain validation status if provided
        pendingChainValidationStatus &&
          this.stores.blocks.setPendingChainValidationStatus(pendingChainValidationStatus),
        // Add any logs emitted during the retrieved blocks
        this.stores.logs.addLogs(newBlocks),
        // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
        ...newBlocks.map(block => this.addContractDataToDb(block)),
        // Promote the proposed checkpoint if requested (uses explicit checkpoint number)
        promoteProposed
          ? this.stores.blocks.promoteProposedToCheckpointed(
              promoteProposed.checkpoint.checkpoint.number,
              promoteProposed.l1,
              promoteProposed.attestations,
              promoteProposed.checkpoint.checkpoint.archive.root,
            )
          : undefined,
        // Evict pending checkpoints that diverged from what L1 mined
        evictProposedFrom !== undefined
          ? this.stores.blocks.evictProposedCheckpointsFrom(evictProposedFrom)
          : undefined,
      ]);

      return { prunedBlocks, lastAlreadyInsertedBlockNumber };
    });
    await this.l2TipsCache?.refresh();
    return result;
  }

  public async addProposedCheckpoint(proposedCheckpoint: ProposedCheckpointInput) {
    const result = await this.stores.db.transactionAsync(async () => {
      await this.stores.blocks.addProposedCheckpoint(proposedCheckpoint);
    });
    await this.l2TipsCache?.refresh();
    return result;
  }

  /**
   * Checks for local proposed blocks that do not match the ones to be checkpointed and prunes them.
   * Conflict detection is keyed on `blockNumber`: when a local proposed block and an L1
   * checkpointed block share a block number but live at different slots (e.g. a different proposer
   * mined the same block number one slot earlier), we still treat them as a conflict and prune.
   * The trailing per-checkpoint prune that handles "local has extra trailing blocks within the
   * same slot as the published checkpoint" remains scoped by slot to preserve pipelining: local
   * blocks that live at a later slot than the checkpoint being processed represent speculation
   * atop the just-confirmed tip (and may be referenced by a pending proposed checkpoint), so we
   * leave them in place. This method handles multiple checkpoints but returns after pruning the
   * first conflict found. This is correct because pruning from the first conflict point removes
   * all subsequent blocks, and when checkpoints are added afterward, they include all the correct
   * blocks.
   */
  private async pruneMismatchingLocalBlocks(checkpoints: PublishedCheckpoint[]): Promise<ReconcileCheckpointsResult> {
    const [lastCheckpointedBlockNumber, lastBlockNumber] = await Promise.all([
      this.stores.blocks.getCheckpointedL2BlockNumber(),
      this.stores.blocks.getLatestL2BlockNumber(),
    ]);

    // Exit early if there are no local uncheckpointed blocks
    if (lastBlockNumber === lastCheckpointedBlockNumber) {
      return { prunedBlocks: undefined, lastAlreadyInsertedBlockNumber: undefined };
    }

    // Get all uncheckpointed local blocks
    const uncheckpointedLocalBlocks = await this.stores.blocks.getBlocksData({
      from: BlockNumber.add(lastCheckpointedBlockNumber, 1),
      limit: lastBlockNumber - lastCheckpointedBlockNumber,
    });

    let lastAlreadyInsertedBlockNumber: BlockNumber | undefined;

    for (const publishedCheckpoint of checkpoints) {
      const checkpointBlocks = publishedCheckpoint.checkpoint.blocks;
      const slot = publishedCheckpoint.checkpoint.slot;

      if (checkpointBlocks.length === 0) {
        this.log.warn(`Checkpoint ${publishedCheckpoint.checkpoint.number} for slot ${slot} has no blocks`);
        continue;
      }

      // Find the first checkpoint block that conflicts with an existing local block and prune local afterwards.
      // Conflict detection joins on block number only — same block number at a different slot is still a conflict.
      for (const checkpointBlock of checkpointBlocks) {
        const blockNumber = checkpointBlock.number;
        const existingBlock = uncheckpointedLocalBlocks.find(b => b.header.getBlockNumber() === blockNumber);
        const blockInfos = {
          existingBlock: existingBlock?.header.toInspect(),
          checkpointBlock: checkpointBlock.toBlockInfo(),
        };

        if (!existingBlock) {
          this.log.verbose(`No local block found for checkpointed block number ${blockNumber}`, blockInfos);
        } else if (existingBlock.archive.root.equals(checkpointBlock.archive.root)) {
          this.log.verbose(`Block number ${blockNumber} already inserted and matches checkpoint`, blockInfos);
          lastAlreadyInsertedBlockNumber = blockNumber;
        } else {
          this.log.info(`Conflict detected at block ${blockNumber} between checkpointed and local block`, blockInfos);
          const prunedBlocks = await this.removeBlocksAfter(BlockNumber(blockNumber - 1));
          await this.evictProposedCheckpointsForPrunedBlocks(prunedBlocks);
          return { prunedBlocks, lastAlreadyInsertedBlockNumber };
        }
      }

      // If the sequencer locally proposed extra blocks within this checkpoint's slot (e.g. local has
      // [N, N+1] but L1 confirmed just [N]), prune the extras. Scoped to the checkpoint's slot so we
      // do not throw away speculative blocks at later slots that belong to a pending proposed checkpoint.
      const lastCheckpointBlockNumber = checkpointBlocks.at(-1)!.number;
      const localBlocksInSlot = uncheckpointedLocalBlocks.filter(b => b.header.getSlot() === slot);
      const lastLocalBlockNumber = localBlocksInSlot.at(-1)?.header.getBlockNumber();

      if (lastLocalBlockNumber !== undefined && lastLocalBlockNumber > lastCheckpointBlockNumber) {
        this.log.warn(
          `Local chain for slot ${slot} ends at block ${lastLocalBlockNumber} but checkpoint ends at ${lastCheckpointBlockNumber}. Pruning blocks after block ${lastCheckpointBlockNumber}.`,
        );
        const prunedBlocks = await this.removeBlocksAfter(lastCheckpointBlockNumber);
        await this.evictProposedCheckpointsForPrunedBlocks(prunedBlocks);
        return { prunedBlocks, lastAlreadyInsertedBlockNumber };
      }
    }

    return { prunedBlocks: undefined, lastAlreadyInsertedBlockNumber };
  }

  /**
   * Replaces the local Inbox message log from `firstDivergentIndex` on with `messages`, moves the message syncpoint
   * and prunes every uncheckpointed block that consumed a message at or past that index, in one store transaction.
   * The caller established the divergence by comparing against a local prefix; that prefix is re-checked inside the
   * transaction and the replacement refused if it moved, so a concurrent change cannot be overwritten by a stale
   * comparison. `messages` may reach back before the divergence (those rows are rewritten in place) and may be empty
   * for a pure truncation.
   *
   * Checkpointed blocks are never pruned here: if the divergence sits below the checkpointed tip's consumed count the
   * published chain is L1's to reconcile, and the result flags it so the caller can gate speculative work meanwhile.
   */
  public async replaceMessageSuffixAndPruneProposedBlocks(input: {
    firstDivergentIndex: bigint;
    expectedPrefix: InboxMessagePosition;
    messages: InboxMessage[];
    syncState: MessageSyncState;
  }): Promise<MessageSuffixReplacementResult> {
    const { firstDivergentIndex, expectedPrefix, messages, syncState } = input;
    const result = await this.stores.db.transactionAsync(async () => {
      const currentPrefix = await this.stores.messages.getMessagePosition(firstDivergentIndex);
      if (currentPrefix === undefined || !currentPrefix.rollingHash.equals(expectedPrefix.rollingHash)) {
        throw new InboxMessagePrefixChangedError(
          firstDivergentIndex,
          expectedPrefix.rollingHash,
          currentPrefix?.rollingHash,
        );
      }
      await this.stores.messages.removeL1ToL2Messages(firstDivergentIndex);
      await this.stores.messages.addL1ToL2Messages(messages, syncState);

      const [checkpointedBlockNumber, latestBlockNumber] = await Promise.all([
        this.stores.blocks.getCheckpointedL2BlockNumber(),
        this.stores.blocks.getLatestL2BlockNumber(),
      ]);
      const checkpointedTipAffected =
        checkpointedBlockNumber > BlockNumber.ZERO &&
        (await this.getConsumedMessageCount(checkpointedBlockNumber)) > firstDivergentIndex;

      let prunedBlocks: L2Block[] = [];
      if (latestBlockNumber > checkpointedBlockNumber) {
        const uncheckpointed = await this.stores.blocks.getBlocksData({
          from: BlockNumber.add(checkpointedBlockNumber, 1),
          limit: latestBlockNumber - checkpointedBlockNumber,
        });
        const firstConsumer = uncheckpointed.find(
          block => BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex) > firstDivergentIndex,
        );
        if (firstConsumer !== undefined) {
          const firstConsumerNumber = firstConsumer.header.getBlockNumber();
          this.log.warn(`Pruning proposed blocks from ${firstConsumerNumber} that consumed replaced Inbox messages`, {
            firstDivergentIndex,
            firstConsumerNumber,
            latestBlockNumber,
          });
          prunedBlocks = await this.removeBlocksAfter(BlockNumber(firstConsumerNumber - 1));
          await this.evictProposedCheckpointsForPrunedBlocks(prunedBlocks);
        }
      }
      return { prunedBlocks, checkpointedTipAffected };
    });
    await this.l2TipsCache?.refresh();
    return result;
  }

  /** The cumulative Inbox message count consumed as of the given block: its L1-to-L2 message tree leaf count. */
  private async getConsumedMessageCount(blockNumber: BlockNumber): Promise<bigint> {
    const [block] = await this.stores.blocks.getBlocksData({ from: blockNumber, limit: 1 });
    if (block === undefined || block.header.getBlockNumber() !== blockNumber) {
      throw new Error(`Block ${blockNumber} is missing from the store`);
    }
    return BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
  }

  /**
   * Removes all uncheckpointed blocks strictly after the specified block number and cleans up associated contract data.
   * This handles removal of provisionally added blocks along with their contract classes/instances.
   * Verifies that each block being removed is not part of a stored checkpoint.
   *
   * @param blockNumber - Remove all blocks with number greater than this.
   * @returns The removed blocks.
   * @throws Error if any block to be removed is checkpointed.
   */
  public async removeUncheckpointedBlocksAfter(blockNumber: BlockNumber): Promise<L2Block[]> {
    const result = await this.stores.db.transactionAsync(async () => {
      // Verify we're only removing uncheckpointed blocks
      const lastCheckpointedBlockNumber = await this.stores.blocks.getCheckpointedL2BlockNumber();
      if (blockNumber < lastCheckpointedBlockNumber) {
        throw new Error(
          `Cannot remove blocks after ${blockNumber} because checkpointed blocks exist up to ${lastCheckpointedBlockNumber}`,
        );
      }

      const prunedBlocks = await this.removeBlocksAfter(blockNumber);
      await this.evictProposedCheckpointsForPrunedBlocks(prunedBlocks);

      return prunedBlocks;
    });
    await this.l2TipsCache?.refresh();
    return result;
  }

  /**
   * Removes all blocks without a proposed checkpoint strictly after the specified block number and cleans up associated contract data.
   * This handles removal of provisionally added blocks along with their contract classes/instances.
   * Verifies that each block being removed is not part of a stored checkpoint (proposed or not).
   * This differs from `removeUncheckpointedBlocksAfter` in that it also checks proposed checkpoints.
   *
   * @param blockNumber - Remove all blocks with number greater than this.
   * @returns The removed blocks.
   * @throws Error if any block to be removed is checkpointed.
   */
  public async removeBlocksWithoutProposedCheckpointAfter(blockNumber: BlockNumber): Promise<L2Block[]> {
    const result = await this.stores.db.transactionAsync(async () => {
      // Verify we're only removing uncheckpointed blocks
      const lastCheckpointedBlockNumber = await this.stores.blocks.getProposedCheckpointL2BlockNumber();
      if (blockNumber < lastCheckpointedBlockNumber) {
        throw new Error(
          `Cannot remove blocks after ${blockNumber} because proposed checkpointed blocks exist up to ${lastCheckpointedBlockNumber}`,
        );
      }

      return await this.removeBlocksAfter(blockNumber);
    });
    await this.l2TipsCache?.refresh();
    return result;
  }

  /**
   * Evicts pending proposed checkpoints that referenced any of the just-pruned blocks. Pruned
   * blocks invalidate all proposed checkpoints from the lowest pruned block's checkpoint number
   * onwards: those checkpoints either reference the pruned blocks directly or chain off them.
   */
  private async evictProposedCheckpointsForPrunedBlocks(prunedBlocks: L2Block[]): Promise<void> {
    if (prunedBlocks.length === 0) {
      return;
    }
    const fromCheckpointNumber = prunedBlocks[0].checkpointNumber;
    await this.stores.blocks.evictProposedCheckpointsFrom(fromCheckpointNumber);
  }

  /**
   * Removes all blocks strictly after the given block number along with any logs and contract data.
   * Does not remove their checkpoints.
   */
  private async removeBlocksAfter(blockNumber: BlockNumber): Promise<L2Block[]> {
    // First get the blocks to be removed so we can clean up contract data
    const removedBlocks = await this.stores.blocks.removeBlocksAfter(blockNumber);

    // Clean up contract data and logs for the removed blocks
    await Promise.all([
      this.stores.logs.deleteLogs(removedBlocks),
      ...removedBlocks.map(block => this.removeContractDataFromDb(block)),
    ]);

    return removedBlocks;
  }

  /**
   * Removes all checkpoints after the given checkpoint number.
   * Deletes ContractClassPublished, ContractInstancePublished, ContractInstanceUpdated data
   * that was stored for the removed checkpoints. Also removes ALL blocks (both checkpointed
   * and uncheckpointed) after the last block of the given checkpoint.
   *
   * @param checkpointNumber - Remove all checkpoints strictly after this one.
   * @returns True if the operation is successful.
   */
  public async removeCheckpointsAfter(checkpointNumber: CheckpointNumber): Promise<boolean> {
    const result = await this.stores.db.transactionAsync(async () => {
      const { blocksRemoved = [] } = await this.stores.blocks.removeCheckpointsAfter(checkpointNumber);

      const opResults = await Promise.all([
        // Prune rolls back to the last proven block, which is by definition valid
        this.stores.blocks.setPendingChainValidationStatus({ valid: true }),
        // Remove contract data for all blocks being removed
        ...blocksRemoved.map(block => this.removeContractDataFromDb(block)),
        this.stores.logs.deleteLogs(blocksRemoved),
      ]);

      return opResults.every(Boolean);
    });
    await this.l2TipsCache?.refresh();
    return result;
  }

  /**
   * Updates the proven checkpoint number and refreshes the L2 tips cache.
   * @param checkpointNumber - The checkpoint number to set as proven.
   */
  public async setProvenCheckpointNumber(checkpointNumber: CheckpointNumber): Promise<void> {
    await this.stores.db.transactionAsync(async () => {
      await this.stores.blocks.setProvenCheckpointNumber(checkpointNumber);
    });
    await this.l2TipsCache?.refresh();
  }

  /**
   * Updates the finalized checkpoint number and refreshes the L2 tips cache.
   * @param checkpointNumber - The checkpoint number to set as finalized.
   */
  public async setFinalizedCheckpointNumber(checkpointNumber: CheckpointNumber): Promise<void> {
    await this.stores.db.transactionAsync(async () => {
      await this.stores.blocks.setFinalizedCheckpointNumber(checkpointNumber);
    });
    await this.l2TipsCache?.refresh();
  }

  /** Extracts and stores contract data from a single block. */
  private addContractDataToDb(block: L2Block): Promise<boolean> {
    return this.updateContractDataOnDb(block, Operation.Store);
  }

  /** Removes contract data associated with a block. */
  private removeContractDataFromDb(block: L2Block): Promise<boolean> {
    return this.updateContractDataOnDb(block, Operation.Delete);
  }

  /** Adds or remove contract data associated with a block. */
  private async updateContractDataOnDb(block: L2Block, operation: Operation): Promise<boolean> {
    const contractClassLogs = block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
    const privateLogs = block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
    const publicLogs = block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);

    return (
      await Promise.all([
        this.updatePublishedContractClasses(contractClassLogs, block.number, operation),
        this.updateDeployedContractInstances(privateLogs, block.number, operation),
        this.updateUpdatedContractInstances(publicLogs, block.header.globalVariables.timestamp, operation),
      ])
    ).every(Boolean);
  }

  /**
   * Extracts and stores contract classes out of ContractClassPublished events emitted by the class registry contract.
   */
  private async updatePublishedContractClasses(
    allLogs: ContractClassLog[],
    blockNum: BlockNumber,
    operation: Operation,
  ): Promise<boolean> {
    const contractClassPublishedEvents = allLogs
      .filter(log => ContractClassPublishedEvent.isContractClassPublishedEvent(log))
      .map(log => ContractClassPublishedEvent.fromLog(log));

    if (operation == Operation.Delete) {
      const contractClasses = contractClassPublishedEvents.map(e => e.toContractClassPublic());
      if (contractClasses.length > 0) {
        contractClasses.forEach(c => this.log.verbose(`${Operation[operation]} contract class ${c.id.toString()}`));
        return await this.stores.contractClasses.deleteContractClasses(contractClasses, blockNum);
      }
      return true;
    }

    // Compute bytecode commitments and validate class IDs in a single pass.
    const contractClasses: ContractClassPublicWithCommitment[] = [];
    for (const event of contractClassPublishedEvents) {
      const contractClass = await event.toContractClassPublicWithBytecodeCommitment();
      const computedClassId = await computeContractClassId({
        artifactHash: contractClass.artifactHash,
        privateFunctionsRoot: contractClass.privateFunctionsRoot,
        publicBytecodeCommitment: contractClass.publicBytecodeCommitment,
      });
      if (!computedClassId.equals(contractClass.id)) {
        this.log.warn(
          `Skipping contract class with mismatched id at block ${blockNum}. Claimed ${contractClass.id}, computed ${computedClassId}`,
          { blockNum, contractClassId: event.contractClassId.toString() },
        );
        continue;
      }
      contractClasses.push(contractClass);
    }

    if (contractClasses.length > 0) {
      contractClasses.forEach(c => this.log.verbose(`${Operation[operation]} contract class ${c.id.toString()}`));
      return await this.stores.contractClasses.addContractClasses(contractClasses, blockNum);
    }
    return true;
  }

  /**
   * Extracts and stores contract instances out of ContractInstancePublished events emitted by the canonical deployer contract.
   */
  private async updateDeployedContractInstances(
    allLogs: PrivateLog[],
    blockNum: BlockNumber,
    operation: Operation,
  ): Promise<boolean> {
    const allInstances = allLogs
      .filter(log => ContractInstancePublishedEvent.isContractInstancePublishedEvent(log))
      .map(log => ContractInstancePublishedEvent.fromLog(log))
      .map(e => e.toContractInstance());

    // Verify that each instance's address matches the one derived from its fields if we're adding
    const contractInstances =
      operation === Operation.Delete
        ? allInstances
        : await filterAsync(allInstances, async instance => {
            const computedAddress = await computeContractAddressFromInstance(instance);
            if (!computedAddress.equals(instance.address)) {
              this.log.warn(
                `Found contract instance with mismatched address at block ${blockNum}. Claimed ${instance.address} but computed ${computedAddress}.`,
                { instanceAddress: instance.address.toString(), computedAddress: computedAddress.toString(), blockNum },
              );
              return false;
            }
            return true;
          });

    if (contractInstances.length > 0) {
      contractInstances.forEach(c =>
        this.log.verbose(`${Operation[operation]} contract instance at ${c.address.toString()}`),
      );
      if (operation == Operation.Store) {
        return await this.stores.contractInstances.addContractInstances(contractInstances, blockNum);
      } else if (operation == Operation.Delete) {
        return await this.stores.contractInstances.deleteContractInstances(contractInstances);
      }
    }
    return true;
  }

  /**
   * Extracts and stores contract instance updates out of ContractInstanceUpdated events.
   */
  private async updateUpdatedContractInstances(
    allLogs: PublicLog[],
    timestamp: UInt64,
    operation: Operation,
  ): Promise<boolean> {
    const contractUpdates = allLogs
      .filter(log => ContractInstanceUpdatedEvent.isContractInstanceUpdatedEvent(log))
      .map(log => ContractInstanceUpdatedEvent.fromLog(log))
      .map(e => e.toContractInstanceUpdate());

    if (contractUpdates.length > 0) {
      contractUpdates.forEach(c =>
        this.log.verbose(`${Operation[operation]} contract instance update at ${c.address.toString()}`),
      );
      if (operation == Operation.Store) {
        return await this.stores.contractInstances.addContractInstanceUpdates(contractUpdates, timestamp);
      } else if (operation == Operation.Delete) {
        return await this.stores.contractInstances.deleteContractInstanceUpdates(contractUpdates, timestamp);
      }
    }
    return true;
  }
}
