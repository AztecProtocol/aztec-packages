import { NULLIFIER_SUBTREE_HEIGHT, PUBLIC_DATA_SUBTREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { IndexedTreeLeafPreimage, SiblingPath } from '@aztec/foundation/trees';
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
import type {
  BatchInsertionResult,
  IndexedTreeId,
  MerkleTreeLeafType,
  MerkleTreeWriteOperations,
  SequentialInsertionResult,
  TreeInfo,
} from '@aztec/stdlib/interfaces/server';
import { ContractClassLog, PrivateLog } from '@aztec/stdlib/logs';
import type { PublicDBAccessStats } from '@aztec/stdlib/stats';
import { MerkleTreeId, NullifierLeaf, PublicDataTreeLeaf, type PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import type { BlockHeader, StateReference, Tx } from '@aztec/stdlib/tx';

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
      ? await tx.filterContractClassLogs(
          tx.data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes,
          /*siloed=*/ true,
        )
      : await tx.filterContractClassLogs(tx.data.forRollup!.end.contractClassLogsHashes, /*siloed=*/ true);

    await this.addContractClassesFromLogs(siloedContractClassLogs, this.currentTxNonRevertibleCache, 'non-revertible');
  }

  /**
   * Add revertible contract classes from a transaction
   * None for private-only txs.
   * @param tx - The transaction to add revertible contract classes from.
   */
  private async addRevertibleContractClasses(tx: Tx) {
    const siloedContractClassLogs = tx.data.forPublic
      ? await tx.filterContractClassLogs(
          tx.data.forPublic!.revertibleAccumulatedData.contractClassLogsHashes,
          /*siloed=*/ true,
        )
      : [];

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
  public async getContractInstance(
    address: AztecAddress,
    blockNumber: number,
  ): Promise<ContractInstanceWithAddress | undefined> {
    // Check caches in order: tx revertible -> tx non-revertible -> block -> data source
    return (
      this.currentTxRevertibleCache.getInstance(address) ??
      this.currentTxNonRevertibleCache.getInstance(address) ??
      this.blockCache.getInstance(address) ??
      (await this.dataSource.getContract(address, blockNumber))
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
 * Proxy class that forwards all merkle tree operations to the underlying object.
 *
 * NOTE: It might be possible to prune this to just the methods used in public.
 * Then we'd need to define a new interface, instead of MerkleTreeWriteOperations,
 * to be used by all our classes (that could be PublicStateDBInterface).
 */
class ForwardMerkleTree implements MerkleTreeWriteOperations {
  constructor(private readonly operations: MerkleTreeWriteOperations) {}

  getTreeInfo(treeId: MerkleTreeId): Promise<TreeInfo> {
    return this.operations.getTreeInfo(treeId);
  }

  getStateReference(): Promise<StateReference> {
    return this.operations.getStateReference();
  }

  getInitialHeader(): BlockHeader {
    return this.operations.getInitialHeader();
  }

  getSiblingPath<N extends number>(treeId: MerkleTreeId, index: bigint): Promise<SiblingPath<N>> {
    return this.operations.getSiblingPath(treeId, index);
  }

  getPreviousValueIndex<ID extends IndexedTreeId>(
    treeId: ID,
    value: bigint,
  ): Promise<
    | {
        index: bigint;
        alreadyPresent: boolean;
      }
    | undefined
  > {
    return this.operations.getPreviousValueIndex(treeId, value);
  }

  getLeafPreimage<ID extends IndexedTreeId>(treeId: ID, index: bigint): Promise<IndexedTreeLeafPreimage | undefined> {
    return this.operations.getLeafPreimage(treeId, index);
  }

  findLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
  ): Promise<(bigint | undefined)[]> {
    return this.operations.findLeafIndices(treeId, values);
  }

  findLeafIndicesAfter<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
    startIndex: bigint,
  ): Promise<(bigint | undefined)[]> {
    return this.operations.findLeafIndicesAfter(treeId, values, startIndex);
  }

  getLeafValue<ID extends MerkleTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<MerkleTreeLeafType<typeof treeId> | undefined> {
    return this.operations.getLeafValue(treeId, index);
  }

  getBlockNumbersForLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    return this.operations.getBlockNumbersForLeafIndices(treeId, leafIndices);
  }

  createCheckpoint(): Promise<void> {
    return this.operations.createCheckpoint();
  }

  commitCheckpoint(): Promise<void> {
    return this.operations.commitCheckpoint();
  }

  revertCheckpoint(): Promise<void> {
    return this.operations.revertCheckpoint();
  }

  appendLeaves<ID extends MerkleTreeId>(treeId: ID, leaves: MerkleTreeLeafType<ID>[]): Promise<void> {
    return this.operations.appendLeaves(treeId, leaves);
  }

  updateArchive(header: BlockHeader): Promise<void> {
    return this.operations.updateArchive(header);
  }

  batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    leaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
    return this.operations.batchInsert(treeId, leaves, subtreeHeight);
  }

  sequentialInsert<TreeHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    leaves: Buffer[],
  ): Promise<SequentialInsertionResult<TreeHeight>> {
    return this.operations.sequentialInsert(treeId, leaves);
  }

  close(): Promise<void> {
    return this.operations.close();
  }
}

/**
 * A class that provides access to the merkle trees, and other helper methods.
 */
export class PublicTreesDB extends ForwardMerkleTree implements PublicStateDBInterface {
  private logger = createLogger('simulator:public-trees-db');

  constructor(private readonly db: MerkleTreeWriteOperations) {
    super(db);
  }

  /**
   * Reads a value from public storage, returning zero if none.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @returns The current value in the storage slot.
   */
  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const leafSlot = (await computePublicDataTreeLeafSlot(contract, slot)).toBigInt();

    const lowLeafResult = await this.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
    if (!lowLeafResult) {
      throw new Error('Low leaf not found');
    }

    // TODO(fcarreiro): We need this for the hints. Might move it to the hinting layer.
    await this.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
    // Unconditionally fetching the preimage for the hints. Move it to the hinting layer?
    const preimage = (await this.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    return lowLeafResult.alreadyPresent ? preimage.leaf.value : Fr.ZERO;
  }

  /**
   * Records a write to public storage.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @param newValue - The new value to store.
   * @returns The slot of the written leaf in the public data tree.
   */
  public async storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<void> {
    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);
    const publicDataWrite = new PublicDataWrite(leafSlot, newValue);
    await this.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()]);
  }

  public async getL1ToL2LeafValue(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.getLeafValue(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);
    // TODO(fcarreiro): We need this for the hints. Might move it to the hinting layer.
    await this.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);

    this.logger.debug(`[DB] Fetched L1 to L2 message leaf value`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getNoteHash(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
    // TODO(fcarreiro): We need this for the hints. Might move it to the hinting layer.
    await this.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex);

    this.logger.debug(`[DB] Fetched note hash leaf value`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-note-hash',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async checkNullifierExists(nullifier: Fr): Promise<boolean> {
    const timer = new Timer();
    const lowLeafResult = await this.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!lowLeafResult) {
      throw new Error('Low leaf not found');
    }
    // TODO(fcarreiro): We need this for the hints. Might move it to the hinting layer.
    await this.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, lowLeafResult.index);
    // TODO(fcarreiro): We need this for the hints. Might move it to the hinting layer.
    await this.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, lowLeafResult.index);
    const exists = lowLeafResult.alreadyPresent;

    this.logger.debug(`[DB] Checked nullifier exists`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'check-nullifier-exists',
    } satisfies PublicDBAccessStats);
    return exists;
  }

  public async padTree(treeId: MerkleTreeId, leavesToInsert: number): Promise<void> {
    switch (treeId) {
      // Indexed trees.
      case MerkleTreeId.NULLIFIER_TREE:
        await this.batchInsert(
          treeId,
          Array(leavesToInsert).fill(NullifierLeaf.empty().toBuffer()),
          NULLIFIER_SUBTREE_HEIGHT,
        );
        break;
      case MerkleTreeId.PUBLIC_DATA_TREE:
        await this.batchInsert(
          treeId,
          Array(leavesToInsert).fill(PublicDataTreeLeaf.empty().toBuffer()),
          PUBLIC_DATA_SUBTREE_HEIGHT,
        );
        break;
      // Non-indexed trees.
      case MerkleTreeId.L1_TO_L2_MESSAGE_TREE:
      case MerkleTreeId.NOTE_HASH_TREE:
        await this.appendLeaves(treeId, Array(leavesToInsert).fill(Fr.ZERO));
        break;
      default:
        throw new Error(`Padding not supported for tree ${treeId}`);
    }
  }
}
