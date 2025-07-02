import { NULLIFIER_SUBTREE_HEIGHT, PUBLIC_DATA_SUBTREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ContractClassRegisteredEvent } from '@aztec/protocol-contracts/class-registerer';
import { ContractInstanceDeployedEvent } from '@aztec/protocol-contracts/instance-deployer';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { ContractClassLog, PrivateLog } from '@aztec/stdlib/logs';
import type { PublicDBAccessStats } from '@aztec/stdlib/stats';
import {
  MerkleTreeId,
  NullifierLeaf,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  getTreeName,
} from '@aztec/stdlib/trees';
import { TreeSnapshots, type Tx } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { PublicContractsDBInterface, PublicStateDBInterface } from './db_interfaces.js';
import { TxContractCache } from './tx_contract_cache.js';

/**
 * Implements the PublicContractsDBInterface using a ContractDataSource.
 * Progressively records contracts in transaction as they are processed in a block.
 * Separates block-level contract information (from processed/included txs) from the
 * current tx's contract information (which may be cleared on tx revert/death).
 */
export class PublicContractsDB implements PublicContractsDBInterface {
  // Two caching layers for contract classes and instances.
  // Tx-level cache:
  //   - The current tx's new contract information is cached
  //     in currentTxNonRevertibleCache and currentTxRevertibleCache.
  // Block-level cache:
  //   - Contract information from earlier in the block, usable by later txs.
  // When a tx succeeds, that tx's caches are merged into the block cache and cleared.
  private currentTxNonRevertibleCache = new TxContractCache();
  private currentTxRevertibleCache = new TxContractCache();
  private blockCache = new TxContractCache();
  // Separate flat cache for bytecode commitments.
  private bytecodeCommitmentCache = new Map<string, Fr>();

  private log = createLogger('simulator:contracts-data-source');

  constructor(private dataSource: ContractDataSource) {}

  /**
   * Add new contracts from a transaction
   * @param tx - The transaction to add contracts from.
   */
  public async addNewContracts(tx: Tx): Promise<void> {
    await this.addNonRevertibleContractClasses(tx);
    await this.addRevertibleContractClasses(tx);
    this.addNonRevertibleContractInstances(tx);
    this.addRevertibleContractInstances(tx);
  }

  /**
   * Add non revertible contracts from a transaction
   * @param tx - The transaction to add non revertible contracts from.
   */
  public async addNewNonRevertibleContracts(tx: Tx) {
    await this.addNonRevertibleContractClasses(tx);
    this.addNonRevertibleContractInstances(tx);
  }

  /**
   * Add revertible contracts from a transaction
   * @param tx - The transaction to add revertible contracts from.
   */
  public async addNewRevertibleContracts(tx: Tx) {
    await this.addRevertibleContractClasses(tx);
    this.addRevertibleContractInstances(tx);
  }

  /**
   * Add non-revertible contract classes from a transaction
   * For private-only txs, this will be all contract classes (found in tx.data.forPublic)
   * @param tx - The transaction to add non-revertible contract classes from.
   */
  private async addNonRevertibleContractClasses(tx: Tx) {
    const siloedContractClassLogs = tx.data.forPublic
      ? tx.getSplitContractClassLogs(false /* revertible */)
      : tx.getContractClassLogs();
    await this.addContractClassesFromLogs(siloedContractClassLogs, this.currentTxNonRevertibleCache, 'non-revertible');
  }

  /**
   * Add revertible contract classes from a transaction
   * None for private-only txs.
   * @param tx - The transaction to add revertible contract classes from.
   */
  private async addRevertibleContractClasses(tx: Tx) {
    const siloedContractClassLogs = tx.data.forPublic ? tx.getSplitContractClassLogs(true /* revertible */) : [];
    await this.addContractClassesFromLogs(siloedContractClassLogs, this.currentTxRevertibleCache, 'revertible');
  }

  /**
   * Add non-revertible contract instances from a transaction
   * For private-only txs, this will be all contract instances (found in tx.data.forRollup)
   * @param tx - The transaction to add non-revertible contract instances from.
   */
  private addNonRevertibleContractInstances(tx: Tx) {
    const contractInstanceLogs = tx.data.forPublic
      ? tx.data.forPublic!.nonRevertibleAccumulatedData.privateLogs.filter(l => !l.isEmpty())
      : tx.data.forRollup!.end.privateLogs.filter(l => !l.isEmpty());

    this.addContractInstancesFromLogs(contractInstanceLogs, this.currentTxNonRevertibleCache, 'non-revertible');
  }

  /**
   * Add revertible contract instances from a transaction
   * None for private-only txs.
   * @param tx - The transaction to add revertible contract instances from.
   */
  private addRevertibleContractInstances(tx: Tx) {
    const contractInstanceLogs = tx.data.forPublic
      ? tx.data.forPublic!.revertibleAccumulatedData.privateLogs.filter(l => !l.isEmpty())
      : [];

    this.addContractInstancesFromLogs(contractInstanceLogs, this.currentTxRevertibleCache, 'revertible');
  }

  /**
   * Given a tx's siloed contract class logs, add the contract classes to the cache
   * @param siloedContractClassLogs - Contract class logs to process
   * @param cache - The cache to store the contract classes in
   * @param cacheType - Type of cache (for logging)
   */
  private async addContractClassesFromLogs(
    siloedContractClassLogs: ContractClassLog[],
    cache: TxContractCache,
    cacheType: string,
  ) {
    const contractClassEvents = siloedContractClassLogs
      .filter((log: ContractClassLog) => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log))
      .map((log: ContractClassLog) => ContractClassRegisteredEvent.fromLog(log));

    // Cache contract classes
    await Promise.all(
      contractClassEvents.map(async (event: ContractClassRegisteredEvent) => {
        this.log.debug(`Adding class ${event.contractClassId.toString()} to contract's ${cacheType} tx cache`);
        const contractClass = await event.toContractClassPublic();

        cache.addClass(event.contractClassId, contractClass);
      }),
    );
  }

  /**
   * Given a tx's contract instance logs, add the contract instances to the cache
   * @param contractInstanceLogs - Contract instance logs to process
   * @param cache - The cache to store the contract instances in
   * @param cacheType - Type of cache (for logging)
   */
  private addContractInstancesFromLogs(contractInstanceLogs: PrivateLog[], cache: TxContractCache, cacheType: string) {
    const contractInstanceEvents = contractInstanceLogs
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log))
      .map(log => ContractInstanceDeployedEvent.fromLog(log));

    // Cache contract instances
    contractInstanceEvents.forEach(e => {
      this.log.debug(
        `Adding instance ${e.address.toString()} with class ${e.contractClassId.toString()} to ${cacheType} tx contract cache`,
      );
      cache.addInstance(e.address, e.toContractInstance());
    });
  }

  /**
   * Clear new contracts from the current tx's cache
   */
  public clearContractsForTx() {
    this.currentTxRevertibleCache.clear();
    this.currentTxRevertibleCache.clear();
    this.currentTxNonRevertibleCache.clear();
  }

  /**
   * Commits the current transaction's cached contracts to the block-level cache.
   * Then, clears the tx cache.
   */
  public commitContractsForTx(onlyNonRevertibles: boolean = false) {
    // Merge non-revertible tx cache into block cache
    this.blockCache.mergeFrom(this.currentTxNonRevertibleCache);

    if (!onlyNonRevertibles) {
      // Merge revertible tx cache into block cache
      this.blockCache.mergeFrom(this.currentTxRevertibleCache);
    }

    // Clear the tx's caches
    this.currentTxNonRevertibleCache.clear();
    this.currentTxRevertibleCache.clear();
  }

  // TODO(fcarreiro/alvaro): This method currently needs a blockNumber. Since this class
  // is only ever used for a given block, it should be possible to construct it with the
  // block number and then forget about it. However, since this class (and interface) is
  // currently more externally exposed than we'd want to, Facundo preferred to not add it
  // to the constructor right now. If we can make this class more private, we should
  // reconsider this. A litmus test is in how many places we need to initialize with a
  // dummy block number (tests or not) and pass block numbers to `super`.
  // Note: Block number got changed to timestamp so this comment ^ is outdated. Keeping
  // the comment as is as I am not part of the AVM cabal.
  public async getContractInstance(
    address: AztecAddress,
    timestamp: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    // Check caches in order: tx revertible -> tx non-revertible -> block -> data source
    return (
      this.currentTxRevertibleCache.getInstance(address) ??
      this.currentTxNonRevertibleCache.getInstance(address) ??
      this.blockCache.getInstance(address) ??
      (await this.dataSource.getContract(address, timestamp))
    );
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    // Check caches in order: tx revertible -> tx non-revertible -> block -> data source
    return (
      this.currentTxRevertibleCache.getClass(contractClassId) ??
      this.currentTxNonRevertibleCache.getClass(contractClassId) ??
      this.blockCache.getClass(contractClassId) ??
      (await this.dataSource.getContractClass(contractClassId))
    );
  }

  public async getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    // Try and retrieve from cache
    const key = contractClassId.toString();
    const result = this.bytecodeCommitmentCache.get(key);
    if (result !== undefined) {
      return result;
    }
    // Now try from the store
    const fromStore = await this.dataSource.getBytecodeCommitment(contractClassId);
    if (fromStore !== undefined) {
      this.bytecodeCommitmentCache.set(key, fromStore);
      return fromStore;
    }

    // Not in either the store or the cache, build it here and cache
    const contractClass = await this.getContractClass(contractClassId);
    if (contractClass === undefined) {
      return undefined;
    }

    const value = await computePublicBytecodeCommitment(contractClass.packedBytecode);
    this.bytecodeCommitmentCache.set(key, value);
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

  public async getL1ToL2LeafValue(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.db.getLeafValue(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);

    this.logger.debug(`Fetched L1 to L2 message leaf value (leafIndex=${leafIndex}, value=${leafValue})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getNoteHash(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.db.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
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
