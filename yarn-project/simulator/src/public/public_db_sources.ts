import {
  L1_TO_L2_MSG_TREE_LEAF_COUNT,
  NOTE_HASH_TREE_LEAF_COUNT,
  NULLIFIER_SUBTREE_HEIGHT,
  PUBLIC_DATA_SUBTREE_HEIGHT,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  type TxContractClassesInstances,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { PublicDBAccessStats } from '@aztec/stdlib/stats';
import {
  MerkleTreeId,
  NullifierLeaf,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  getTreeName,
} from '@aztec/stdlib/trees';
import { TreeSnapshots, Tx } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { strict as assert } from 'assert';

import type { PublicContractsDBInterface, PublicStateDBInterface } from './db_interfaces.js';
import { L1ToL2MessageIndexOutOfRangeError, NoteHashIndexOutOfRangeError } from './side_effect_errors.js';
import { TxContractCache } from './tx_contract_cache.js';

/**
 * Implements the PublicContractsDBInterface using a ContractDataSource.
 * Uses a stack-based caching strategy to support checkpointing:
 * - Bottom of stack (level 0): Block cache - contracts from completed transactions
 * - Subsequent levels (1-2): Checkpoint caches for speculative contract additions
 *
 * Maximum depth is 3 levels (base + 2 checkpoints) to match transaction structure:
 * - Level 0: Base (block cache)
 * - Level 1: Non-revertible tx contracts (first checkpoint)
 * - Level 2: Revertible tx contracts (second checkpoint)
 */
export class PublicContractsDB implements PublicContractsDBInterface {
  // Stack-based cache structure
  private cacheStack: TxContractCache[] = [new TxContractCache()];

  // Maximum 3 levels: block (base), tx non-revertible, tx revertible
  private static readonly MAX_CHECKPOINT_DEPTH = 4;

  private log = createLogger('simulator:contracts-data-source');

  constructor(private dataSource: ContractDataSource) {}

  /**
   * Unified contract addition method.
   * Adds contracts to the top of the cache stack (current checkpoint level).
   * @param contractClasses - Array of contract classes to add.
   * @param contractInstances - Array of contract instances to add.
   */
  public async addContracts(
    contractClasses: ContractClassPublic[],
    contractInstances: ContractInstanceWithAddress[],
  ): Promise<void> {
    const currentCache = this.cacheStack[this.cacheStack.length - 1];
    const cacheType = this.cacheStack.length === 1 ? 'block' : 'checkpoint';

    // Add contract classes and compute/cache bytecode commitments
    for (const contractClass of contractClasses) {
      this.log.debug(`Adding class ${contractClass.id.toString()} to ${cacheType} cache`);
      currentCache.addClass(contractClass.id, contractClass);

      // Compute and cache bytecode commitment
      const commitment = await computePublicBytecodeCommitment(contractClass.packedBytecode);
      currentCache.setBytecodeCommitment(contractClass.id, commitment);
    }

    // Add contract instances
    for (const instance of contractInstances) {
      this.log.debug(
        `Adding instance ${instance.address.toString()} with class ${instance.currentContractClassId.toString()} to ${cacheType} cache`,
      );
      currentCache.addInstance(instance.address, instance);
    }
  }

  // Helper
  public async getContractClassesAndInstancesFromTx(tx: Tx): Promise<TxContractClassesInstances> {
    const {
      nonRevertibleContractClassLogs,
      nonRevertibleContractInstanceLogs,
      revertibleContractClassLogs,
      revertibleContractInstanceLogs,
    } = tx.getContractDeploymentLogs();
    const nonRevertibleContractClasses =
      await ContractClassPublishedEvent.extractContractClasses(nonRevertibleContractClassLogs);
    const nonRevertibleContractInstances = await ContractInstancePublishedEvent.extractContractInstances(
      nonRevertibleContractInstanceLogs,
    );
    const revertibleContractClasses =
      await ContractClassPublishedEvent.extractContractClasses(revertibleContractClassLogs);
    const revertibleContractInstances =
      await ContractInstancePublishedEvent.extractContractInstances(revertibleContractInstanceLogs);

    return {
      nonRevertibleContractClasses,
      nonRevertibleContractInstances,
      revertibleContractClasses,
      revertibleContractInstances,
    };
  }

  // Helper
  public async addContractsFromTx(tx: Tx): Promise<void> {
    const {
      nonRevertibleContractClasses,
      nonRevertibleContractInstances,
      revertibleContractClasses,
      revertibleContractInstances,
    } = await this.getContractClassesAndInstancesFromTx(tx);
    await this.addContracts(nonRevertibleContractClasses, nonRevertibleContractInstances);
    await this.addContracts(revertibleContractClasses, revertibleContractInstances);
  }

  /**
   * Create a checkpoint by copying current top and pushing.
   * Maximum of 3 total levels allowed (1 base + 2 checkpoints).
   *
   * Pattern follows SideEffectTracker: copy parent state so checkpoint
   * starts with everything from parent visible.
   */
  public createCheckpoint(): void {
    if (this.cacheStack.length >= PublicContractsDB.MAX_CHECKPOINT_DEPTH) {
      throw new Error(
        `Maximum checkpoint depth of ${PublicContractsDB.MAX_CHECKPOINT_DEPTH} exceeded. ` +
          `Current depth: ${this.cacheStack.length}`,
      );
    }

    // Copy current top (inherits all parent contracts)
    const currentTop = this.cacheStack[this.cacheStack.length - 1];
    const newLevel = new TxContractCache();
    newLevel.mergeFrom(currentTop);

    this.cacheStack.push(newLevel);

    this.log.debug(`Created checkpoint, stack depth now ${this.cacheStack.length}`);
  }

  /**
   * Commit checkpoint - replace parent with checkpoint.
   *
   * Pattern follows SideEffectTracker: checkpoint already contains
   * parent + new contracts, so just replace parent with it.
   */
  public commitCheckpoint(): void {
    if (this.cacheStack.length <= 1) {
      throw new Error('No active checkpoint to commit');
    }

    // Pop checkpoint and replace parent with it
    const checkpointCache = this.cacheStack.pop()!;
    this.cacheStack[this.cacheStack.length - 1] = checkpointCache;

    this.log.debug(`Committed checkpoint, stack depth now ${this.cacheStack.length}`);
  }

  /**
   * Revert checkpoint - discard top cache.
   *
   * Pattern follows SideEffectTracker: just pop to discard changes.
   */
  public revertCheckpoint(): void {
    if (this.cacheStack.length <= 1) {
      throw new Error('No active checkpoint to revert');
    }

    // Simply pop and discard the top cache
    this.cacheStack.pop();

    this.log.debug(`Reverted checkpoint, stack depth now ${this.cacheStack.length}`);
  }

  /**
   * Query methods only check top of stack (which has all contracts).
   *
   * Since createCheckpoint copies parent, top always contains all visible contracts.
   */
  public async getContractInstance(
    address: AztecAddress,
    timestamp: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    // Check top cache (which includes all parent contracts)
    const topCache = this.cacheStack[this.cacheStack.length - 1];
    const instance = topCache.getInstance(address);
    if (instance) {
      return instance;
    }

    // Fall back to data source
    return await this.dataSource.getContract(address, timestamp);
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    // Check top cache (which includes all parent contracts)
    const topCache = this.cacheStack[this.cacheStack.length - 1];
    const contractClass = topCache.getClass(contractClassId);
    if (contractClass) {
      return contractClass;
    }

    // Fall back to data source
    return await this.dataSource.getContractClass(contractClassId);
  }

  public async getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    // Check top cache (which includes all parent bytecode commitments)
    const topCache = this.cacheStack[this.cacheStack.length - 1];
    const cached = topCache.getBytecodeCommitment(contractClassId);
    if (cached) {
      return cached;
    }

    // Try from the store
    const fromStore = await this.dataSource.getBytecodeCommitment(contractClassId);
    if (fromStore !== undefined) {
      topCache.setBytecodeCommitment(contractClassId, fromStore);
      return fromStore;
    }

    // Not in either the store or the cache, build it here and cache
    const contractClass = await this.getContractClass(contractClassId);
    if (contractClass === undefined) {
      return undefined;
    }

    const value = await computePublicBytecodeCommitment(contractClass.packedBytecode);
    topCache.setBytecodeCommitment(contractClassId, value);
    return value;
  }

  public async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return await this.dataSource.getDebugFunctionName(address, selector);
  }
}

/**
 * A high-level class that provides access to the merkle trees.
 *
 * This class is just a helper wrapper around a merkle db. Anything that you can do with it
 * can also be done directly with the merkle db. This class should NOT be exposed or used
 * outside of `simulator/src/public`.
 *
 * NOTE: This class is currently written in such a way that it would generate the
 * necessary hints if used with a hinting merkle db. This is a bit of a leak of concepts.
 * Eventually we can have everything depend on a config/factory at the TxSimulator level
 * to decide whether to use hints or not (same with tracing, etc).
 */
export class PublicTreesDB implements PublicStateDBInterface {
  private logger = createLogger('simulator:public-trees-db');

  constructor(private readonly db: MerkleTreeWriteOperations) {}

  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const timer = new Timer();
    const leafSlot = (await computePublicDataTreeLeafSlot(contract, slot)).toBigInt();

    const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
    if (!lowLeafResult) {
      throw new Error('Low leaf not found');
    }

    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
    // Unconditionally fetching the preimage for the hints. Move it to the hinting layer?
    const preimage = (await this.db.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    const result = lowLeafResult.alreadyPresent ? preimage.leaf.value : Fr.ZERO;
    this.logger.debug(`Storage read (contract=${contract}, slot=${slot}, value=${result})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'storage-read',
    } satisfies PublicDBAccessStats);

    return result;
  }

  public async storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<void> {
    const timer = new Timer();
    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);
    const publicDataWrite = new PublicDataWrite(leafSlot, newValue);
    await this.db.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()]);

    this.logger.debug(`Storage write (contract=${contract}, slot=${slot}, value=${newValue})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'storage-write',
    } satisfies PublicDBAccessStats);
  }

  public async getL1ToL2LeafValue(leafIndex: bigint): Promise<Fr> {
    const timer = new Timer();
    if (leafIndex > L1_TO_L2_MSG_TREE_LEAF_COUNT) {
      throw new L1ToL2MessageIndexOutOfRangeError(Number(leafIndex));
    }
    const leafValue = await this.db.getLeafValue(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);
    assert(leafValue !== undefined, 'Unexpected null response from l1 to l2 message tree');
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);

    this.logger.debug(`Fetched L1 to L2 message leaf value (leafIndex=${leafIndex}, value=${leafValue})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getNoteHash(leafIndex: bigint): Promise<Fr> {
    const timer = new Timer();
    if (leafIndex > NOTE_HASH_TREE_LEAF_COUNT) {
      throw new NoteHashIndexOutOfRangeError(Number(leafIndex));
    }
    const leafValue = await this.db.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
    assert(leafValue !== undefined, 'Unexpected null response from note hash tree');
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex);

    this.logger.debug(`Fetched note hash leaf value (leafIndex=${leafIndex}, value=${leafValue})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-note-hash',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async writeNoteHash(noteHash: Fr): Promise<void> {
    const timer = new Timer();
    await this.db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [noteHash]);

    this.logger.debug(`Wrote note hash (noteHash=${noteHash})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'write-note-hash',
    } satisfies PublicDBAccessStats);
  }

  public async checkNullifierExists(nullifier: Fr): Promise<boolean> {
    const timer = new Timer();
    const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!lowLeafResult) {
      throw new Error('Low leaf not found');
    }
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, lowLeafResult.index);
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, lowLeafResult.index);
    const exists = lowLeafResult.alreadyPresent;

    this.logger.debug(`Checked nullifier exists (nullifier=${nullifier}, exists=${exists})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'check-nullifier-exists',
    } satisfies PublicDBAccessStats);
    return exists;
  }

  public async writeNullifier(siloedNullifier: Fr): Promise<void> {
    const timer = new Timer();
    await this.db.sequentialInsert(MerkleTreeId.NULLIFIER_TREE, [siloedNullifier.toBuffer()]);

    this.logger.debug(`Wrote nullifier (nullifier=${siloedNullifier})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'write-nullifier',
    } satisfies PublicDBAccessStats);
  }

  public async padTree(treeId: MerkleTreeId, leavesToInsert: number): Promise<void> {
    const timer = new Timer();

    switch (treeId) {
      // Indexed trees.
      case MerkleTreeId.NULLIFIER_TREE:
        await this.db.batchInsert(
          treeId,
          Array(leavesToInsert).fill(NullifierLeaf.empty().toBuffer()),
          NULLIFIER_SUBTREE_HEIGHT,
        );
        break;
      case MerkleTreeId.PUBLIC_DATA_TREE:
        await this.db.batchInsert(
          treeId,
          Array(leavesToInsert).fill(PublicDataTreeLeaf.empty().toBuffer()),
          PUBLIC_DATA_SUBTREE_HEIGHT,
        );
        break;
      // Append-only trees.
      case MerkleTreeId.L1_TO_L2_MESSAGE_TREE:
      case MerkleTreeId.NOTE_HASH_TREE:
        await this.db.appendLeaves(treeId, Array(leavesToInsert).fill(Fr.ZERO));
        break;
      default:
        throw new Error(`Padding not supported for tree ${treeId}`);
    }

    this.logger.debug(`Padded tree (tree=${getTreeName(treeId)}, leavesToInsert=${leavesToInsert})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'pad-tree',
    } satisfies PublicDBAccessStats);
  }

  public async createCheckpoint(): Promise<void> {
    await this.db.createCheckpoint();
  }

  public async commitCheckpoint(): Promise<void> {
    await this.db.commitCheckpoint();
  }

  public async revertCheckpoint(): Promise<void> {
    await this.db.revertCheckpoint();
  }

  public async getTreeSnapshots(): Promise<TreeSnapshots> {
    const stateReference = await this.db.getStateReference();
    return new TreeSnapshots(
      stateReference.l1ToL2MessageTree,
      stateReference.partial.noteHashTree,
      stateReference.partial.nullifierTree,
      stateReference.partial.publicDataTree,
    );
  }
}
