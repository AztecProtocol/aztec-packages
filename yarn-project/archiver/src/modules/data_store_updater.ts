import { BlockNumber, type CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import {
  ContractClassPublishedEvent,
  PrivateFunctionBroadcastedEvent,
  UtilityFunctionBroadcastedEvent,
} from '@aztec/protocol-contracts/class-registry';
import {
  ContractInstancePublishedEvent,
  ContractInstanceUpdatedEvent,
} from '@aztec/protocol-contracts/instance-registry';
import type { L2BlockNew, ValidateCheckpointResult } from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import {
  type ExecutablePrivateFunctionWithMembershipProof,
  type UtilityFunctionWithMembershipProof,
  computePublicBytecodeCommitment,
  isValidPrivateFunctionMembershipProof,
  isValidUtilityFunctionMembershipProof,
} from '@aztec/stdlib/contract';
import type { ContractClassLog, PrivateLog, PublicLog } from '@aztec/stdlib/logs';
import type { UInt64 } from '@aztec/stdlib/types';

import groupBy from 'lodash.groupby';

import type { KVArchiverDataStore } from '../store/kv_archiver_store.js';

/** Operation type for contract data updates. */
enum Operation {
  Store,
  Delete,
}

/** Result of adding checkpoints with information about any pruned blocks. */
type ReconcileCheckpointsResult = {
  /** Blocks that were pruned due to conflict with L1 checkpoints. */
  prunedBlocks: L2BlockNew[] | undefined;
  /** Last block number that was already inserted locally, or undefined if none. */
  lastAlreadyInsertedBlockNumber: BlockNumber | undefined;
};

/** Archiver helper module to handle updates to the data store. */
export class ArchiverDataStoreUpdater {
  private readonly log = createLogger('archiver:store_updater');

  constructor(private store: KVArchiverDataStore) {}

  /**
   * Adds blocks to the store with contract class/instance extraction from logs.
   * Extracts ContractClassPublished, ContractInstancePublished, ContractInstanceUpdated events,
   * and individually broadcasted functions from the block logs.
   *
   * @param blocks - The L2 blocks to add.
   * @param pendingChainValidationStatus - Optional validation status to set.
   * @returns True if the operation is successful.
   */
  public addBlocks(blocks: L2BlockNew[], pendingChainValidationStatus?: ValidateCheckpointResult): Promise<boolean> {
    return this.store.transactionAsync(async () => {
      await this.store.addBlocks(blocks);

      const opResults = await Promise.all([
        // Update the pending chain validation status if provided
        pendingChainValidationStatus && this.store.setPendingChainValidationStatus(pendingChainValidationStatus),
        // Add any logs emitted during the retrieved blocks
        this.store.addLogs(blocks),
        // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
        ...blocks.map(block => this.addBlockDataToDB(block)),
      ]);

      return opResults.every(Boolean);
    });
  }

  /**
   * Reconciles local blocks with incoming checkpoints from L1.
   * Adds checkpoints to the store with contract class/instance extraction from logs.
   * Prunes any local blocks that conflict with checkpoint data (by comparing archive roots).
   * Extracts ContractClassPublished, ContractInstancePublished, ContractInstanceUpdated events,
   * and individually broadcasted functions from the checkpoint block logs.
   *
   * @param checkpoints - The published checkpoints to add.
   * @param pendingChainValidationStatus - Optional validation status to set.
   * @returns Result with information about any pruned blocks.
   */
  public setNewCheckpointData(
    checkpoints: PublishedCheckpoint[],
    pendingChainValidationStatus?: ValidateCheckpointResult,
  ): Promise<ReconcileCheckpointsResult> {
    return this.store.transactionAsync(async () => {
      // Before adding checkpoints, check for conflicts with local blocks if any
      const { prunedBlocks, lastAlreadyInsertedBlockNumber } = await this.pruneMismatchingLocalBlocks(checkpoints);

      await this.store.addCheckpoints(checkpoints);

      // Filter out blocks that were already inserted via addBlocks() to avoid duplicating logs/contract data
      const newBlocks = checkpoints
        .flatMap((ch: PublishedCheckpoint) => ch.checkpoint.blocks)
        .filter(b => lastAlreadyInsertedBlockNumber === undefined || b.number > lastAlreadyInsertedBlockNumber);

      await Promise.all([
        // Update the pending chain validation status if provided
        pendingChainValidationStatus && this.store.setPendingChainValidationStatus(pendingChainValidationStatus),
        // Add any logs emitted during the retrieved blocks
        this.store.addLogs(newBlocks),
        // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
        ...newBlocks.map(block => this.addBlockDataToDB(block)),
      ]);

      return { prunedBlocks, lastAlreadyInsertedBlockNumber };
    });
  }

  /**
   * Checks for local proposed blocks that do not match the ones to be checkpointed and prunes them.
   * This method handles multiple checkpoints but returns after pruning the first conflict found.
   * This is correct because pruning from the first conflict point removes all subsequent blocks,
   * and when checkpoints are added afterward, they include all the correct blocks.
   */
  private async pruneMismatchingLocalBlocks(checkpoints: PublishedCheckpoint[]): Promise<ReconcileCheckpointsResult> {
    const [lastCheckpointedBlockNumber, lastBlockNumber] = await Promise.all([
      this.store.getCheckpointedL2BlockNumber(),
      this.store.getLatestBlockNumber(),
    ]);

    // Exit early if there are no local uncheckpointed blocks
    if (lastBlockNumber === lastCheckpointedBlockNumber) {
      return { prunedBlocks: undefined, lastAlreadyInsertedBlockNumber: undefined };
    }

    // Get all uncheckpointed local blocks
    const uncheckpointedLocalBlocks = await this.store.getBlocks(
      BlockNumber.add(lastCheckpointedBlockNumber, 1),
      lastBlockNumber - lastCheckpointedBlockNumber,
    );

    let lastAlreadyInsertedBlockNumber: BlockNumber | undefined;

    for (const publishedCheckpoint of checkpoints) {
      const checkpointBlocks = publishedCheckpoint.checkpoint.blocks;
      const slot = publishedCheckpoint.checkpoint.slot;
      const localBlocksInSlot = uncheckpointedLocalBlocks.filter(b => b.slot === slot);

      if (checkpointBlocks.length === 0) {
        this.log.warn(`Checkpoint ${publishedCheckpoint.checkpoint.number} for slot ${slot} has no blocks`);
        continue;
      }

      // Find the first checkpoint block that conflicts with an existing local block and prune local afterwards
      for (const checkpointBlock of checkpointBlocks) {
        const blockNumber = checkpointBlock.number;
        const existingBlock = localBlocksInSlot.find(b => b.number === blockNumber);
        const blockInfos = {
          existingBlock: existingBlock?.toBlockInfo(),
          checkpointBlock: checkpointBlock.toBlockInfo(),
        };

        if (!existingBlock) {
          this.log.verbose(`No local block found for checkpointed block number ${blockNumber}`, blockInfos);
        } else if (existingBlock.archive.root.equals(checkpointBlock.archive.root)) {
          this.log.verbose(`Block number ${blockNumber} already inserted and matches checkpoint`, blockInfos);
          lastAlreadyInsertedBlockNumber = blockNumber;
        } else {
          this.log.warn(`Conflict detected at block ${blockNumber} between checkpointed and local block`, blockInfos);
          const prunedBlocks = await this.removeBlocksAfter(BlockNumber(blockNumber - 1));
          return { prunedBlocks, lastAlreadyInsertedBlockNumber };
        }
      }

      // If local has more blocks than the checkpoint (e.g., local has [2,3,4] but checkpoint has [2,3]),
      // we need to prune the extra local blocks so they match what was checkpointed
      const lastCheckpointBlockNumber = checkpointBlocks.at(-1)!.number;
      const lastLocalBlockNumber = localBlocksInSlot.at(-1)?.number;

      if (lastLocalBlockNumber !== undefined && lastLocalBlockNumber > lastCheckpointBlockNumber) {
        this.log.warn(
          `Local chain for slot ${slot} ends at block ${lastLocalBlockNumber} but checkpoint ends at ${lastCheckpointBlockNumber}. Pruning blocks after block ${lastCheckpointBlockNumber}.`,
        );
        const prunedBlocks = await this.removeBlocksAfter(lastCheckpointBlockNumber);
        return { prunedBlocks, lastAlreadyInsertedBlockNumber };
      }
    }

    return { prunedBlocks: undefined, lastAlreadyInsertedBlockNumber };
  }

  /**
   * Removes all blocks strictly after the specified block number and cleans up associated contract data.
   * This handles removal of provisionally added blocks along with their contract classes/instances.
   *
   * @param blockNumber - Remove all blocks with number greater than this.
   * @returns The removed blocks.
   */
  public removeBlocksAfter(blockNumber: BlockNumber): Promise<L2BlockNew[]> {
    return this.store.transactionAsync(async () => {
      // First get the blocks to be removed so we can clean up contract data
      const removedBlocks = await this.store.removeBlocksAfter(blockNumber);

      // Clean up contract data and logs for the removed blocks
      await Promise.all([
        this.store.deleteLogs(removedBlocks),
        ...removedBlocks.map(block => this.removeBlockDataFromDB(block)),
      ]);

      return removedBlocks;
    });
  }

  /**
   * Unwinds checkpoints from the store with reverse contract extraction.
   * Deletes ContractClassPublished, ContractInstancePublished, ContractInstanceUpdated data
   * that was stored for the unwound checkpoints.
   *
   * @param from - The checkpoint number to unwind from (must be the current tip).
   * @param checkpointsToUnwind - The number of checkpoints to unwind.
   * @returns True if the operation is successful.
   */
  public async unwindCheckpoints(from: CheckpointNumber, checkpointsToUnwind: number): Promise<boolean> {
    if (checkpointsToUnwind <= 0) {
      throw new Error(`Cannot unwind ${checkpointsToUnwind} blocks`);
    }

    const last = await this.store.getSynchedCheckpointNumber();
    if (from != last) {
      throw new Error(`Cannot unwind checkpoints from checkpoint ${from} when the last checkpoint is ${last}`);
    }

    const blocks = [];
    const lastCheckpointNumber = from + checkpointsToUnwind - 1;
    for (let checkpointNumber = from; checkpointNumber <= lastCheckpointNumber; checkpointNumber++) {
      const blocksForCheckpoint = await this.store.getBlocksForCheckpoint(checkpointNumber);
      if (!blocksForCheckpoint) {
        continue;
      }
      blocks.push(...blocksForCheckpoint);
    }

    const opResults = await Promise.all([
      // Prune rolls back to the last proven block, which is by definition valid
      this.store.setPendingChainValidationStatus({ valid: true }),
      // Remove contract data for all blocks being unwound
      ...blocks.map(block => this.removeBlockDataFromDB(block)),
      this.store.deleteLogs(blocks),
      this.store.unwindCheckpoints(from, checkpointsToUnwind),
    ]);

    return opResults.every(Boolean);
  }

  /** Extracts and stores contract data from a single block. */
  private addBlockDataToDB(block: L2BlockNew): Promise<boolean> {
    return this.editContractBlockData(block, Operation.Store);
  }

  /** Removes contract data associated with a block. */
  private removeBlockDataFromDB(block: L2BlockNew): Promise<boolean> {
    return this.editContractBlockData(block, Operation.Delete);
  }

  /** Adds or remove contract data associated with a block. */
  private async editContractBlockData(block: L2BlockNew, operation: Operation): Promise<boolean> {
    const contractClassLogs = block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
    const privateLogs = block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
    const publicLogs = block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);

    return (
      await Promise.all([
        this.updatePublishedContractClasses(contractClassLogs, block.number, operation),
        this.updateDeployedContractInstances(privateLogs, block.number, operation),
        this.updateUpdatedContractInstances(publicLogs, block.header.globalVariables.timestamp, operation),
        operation === Operation.Store
          ? this.storeBroadcastedIndividualFunctions(contractClassLogs, block.number)
          : Promise.resolve(true),
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

    const contractClasses = await Promise.all(contractClassPublishedEvents.map(e => e.toContractClassPublic()));
    if (contractClasses.length > 0) {
      contractClasses.forEach(c => this.log.verbose(`${Operation[operation]} contract class ${c.id.toString()}`));
      if (operation == Operation.Store) {
        // TODO: Will probably want to create some worker threads to compute these bytecode commitments as they are expensive
        const commitments = await Promise.all(
          contractClasses.map(c => computePublicBytecodeCommitment(c.packedBytecode)),
        );
        return await this.store.addContractClasses(contractClasses, commitments, blockNum);
      } else if (operation == Operation.Delete) {
        return await this.store.deleteContractClasses(contractClasses, blockNum);
      }
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
    const contractInstances = allLogs
      .filter(log => ContractInstancePublishedEvent.isContractInstancePublishedEvent(log))
      .map(log => ContractInstancePublishedEvent.fromLog(log))
      .map(e => e.toContractInstance());
    if (contractInstances.length > 0) {
      contractInstances.forEach(c =>
        this.log.verbose(`${Operation[operation]} contract instance at ${c.address.toString()}`),
      );
      if (operation == Operation.Store) {
        return await this.store.addContractInstances(contractInstances, blockNum);
      } else if (operation == Operation.Delete) {
        return await this.store.deleteContractInstances(contractInstances, blockNum);
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
        return await this.store.addContractInstanceUpdates(contractUpdates, timestamp);
      } else if (operation == Operation.Delete) {
        return await this.store.deleteContractInstanceUpdates(contractUpdates, timestamp);
      }
    }
    return true;
  }

  /**
   * Stores the functions that were broadcasted individually.
   *
   * @dev Beware that there is not a delete variant of this, since they are added to contract classes
   *      and will be deleted as part of the class if needed.
   */
  private async storeBroadcastedIndividualFunctions(
    allLogs: ContractClassLog[],
    _blockNum: BlockNumber,
  ): Promise<boolean> {
    // Filter out private and utility function broadcast events
    const privateFnEvents = allLogs
      .filter(log => PrivateFunctionBroadcastedEvent.isPrivateFunctionBroadcastedEvent(log))
      .map(log => PrivateFunctionBroadcastedEvent.fromLog(log));
    const utilityFnEvents = allLogs
      .filter(log => UtilityFunctionBroadcastedEvent.isUtilityFunctionBroadcastedEvent(log))
      .map(log => UtilityFunctionBroadcastedEvent.fromLog(log));

    // Group all events by contract class id
    for (const [classIdString, classEvents] of Object.entries(
      groupBy([...privateFnEvents, ...utilityFnEvents], e => e.contractClassId.toString()),
    )) {
      const contractClassId = Fr.fromHexString(classIdString);
      const contractClass = await this.store.getContractClass(contractClassId);
      if (!contractClass) {
        this.log.warn(`Skipping broadcasted functions as contract class ${contractClassId.toString()} was not found`);
        continue;
      }

      // Split private and utility functions, and filter out invalid ones
      const allFns = classEvents.map(e => e.toFunctionWithMembershipProof());
      const privateFns = allFns.filter(
        (fn): fn is ExecutablePrivateFunctionWithMembershipProof => 'utilityFunctionsTreeRoot' in fn,
      );
      const utilityFns = allFns.filter(
        (fn): fn is UtilityFunctionWithMembershipProof => 'privateFunctionsArtifactTreeRoot' in fn,
      );

      const privateFunctionsWithValidity = await Promise.all(
        privateFns.map(async fn => ({ fn, valid: await isValidPrivateFunctionMembershipProof(fn, contractClass) })),
      );
      const validPrivateFns = privateFunctionsWithValidity.filter(({ valid }) => valid).map(({ fn }) => fn);
      const utilityFunctionsWithValidity = await Promise.all(
        utilityFns.map(async fn => ({
          fn,
          valid: await isValidUtilityFunctionMembershipProof(fn, contractClass),
        })),
      );
      const validUtilityFns = utilityFunctionsWithValidity.filter(({ valid }) => valid).map(({ fn }) => fn);
      const validFnCount = validPrivateFns.length + validUtilityFns.length;
      if (validFnCount !== allFns.length) {
        this.log.warn(`Skipping ${allFns.length - validFnCount} invalid functions`);
      }

      // Store the functions in the contract class in a single operation
      if (validFnCount > 0) {
        this.log.verbose(`Storing ${validFnCount} functions for contract class ${contractClassId.toString()}`);
      }
      return await this.store.addFunctions(contractClassId, validPrivateFns, validUtilityFns);
    }
    return true;
  }
}
