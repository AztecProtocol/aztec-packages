import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
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
  public addBlocksWithContractData(
    blocks: L2BlockNew[],
    pendingChainValidationStatus?: ValidateCheckpointResult,
  ): Promise<boolean> {
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
   * Adds checkpoints to the store with contract class/instance extraction from logs.
   * Extracts ContractClassPublished, ContractInstancePublished, ContractInstanceUpdated events,
   * and individually broadcasted functions from the checkpoint block logs.
   *
   * @param checkpoints - The published checkpoints to add.
   * @param pendingChainValidationStatus - Optional validation status to set.
   * @returns True if the operation is successful.
   */
  public addCheckpointsWithContractData(
    checkpoints: PublishedCheckpoint[],
    pendingChainValidationStatus?: ValidateCheckpointResult,
  ): Promise<boolean> {
    return this.store.transactionAsync(async () => {
      await this.store.addCheckpoints(checkpoints);
      const allBlocks = checkpoints.flatMap((ch: PublishedCheckpoint) => ch.checkpoint.blocks);

      const opResults = await Promise.all([
        // Update the pending chain validation status if provided
        pendingChainValidationStatus && this.store.setPendingChainValidationStatus(pendingChainValidationStatus),
        // Add any logs emitted during the retrieved blocks
        this.store.addLogs(allBlocks),
        // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
        ...allBlocks.map(block => this.addBlockDataToDB(block)),
      ]);

      return opResults.every(Boolean);
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
  public async unwindCheckpointsWithContractData(
    from: CheckpointNumber,
    checkpointsToUnwind: number,
  ): Promise<boolean> {
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
      // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
      ...blocks.map(async block => {
        const contractClassLogs = block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
        // ContractInstancePublished event logs are broadcast in privateLogs.
        const privateLogs = block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
        const publicLogs = block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);

        return (
          await Promise.all([
            this.updatePublishedContractClasses(contractClassLogs, block.number, Operation.Delete),
            this.updateDeployedContractInstances(privateLogs, block.number, Operation.Delete),
            this.updateUpdatedContractInstances(publicLogs, block.header.globalVariables.timestamp, Operation.Delete),
          ])
        ).every(Boolean);
      }),

      this.store.deleteLogs(blocks),
      this.store.unwindCheckpoints(from, checkpointsToUnwind),
    ]);

    return opResults.every(Boolean);
  }

  /**
   * Extracts and stores contract data from a single block.
   */
  private async addBlockDataToDB(block: L2BlockNew): Promise<boolean> {
    const contractClassLogs = block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
    // ContractInstancePublished event logs are broadcast in privateLogs.
    const privateLogs = block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
    const publicLogs = block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);

    return (
      await Promise.all([
        this.updatePublishedContractClasses(contractClassLogs, block.number, Operation.Store),
        this.updateDeployedContractInstances(privateLogs, block.number, Operation.Store),
        this.updateUpdatedContractInstances(publicLogs, block.header.globalVariables.timestamp, Operation.Store),
        this.storeBroadcastedIndividualFunctions(contractClassLogs, block.number),
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
