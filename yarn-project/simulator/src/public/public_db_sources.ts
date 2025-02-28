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
import type {
  MerkleTreeCheckpointOperations,
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import type { ContractClassLog } from '@aztec/stdlib/logs';
import type { PublicDBAccessStats } from '@aztec/stdlib/stats';
import { MerkleTreeId, type PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import type { Tx } from '@aztec/stdlib/tx';

import type { PublicContractsDB, PublicStateDB } from '../common/db_interfaces.js';
import { TxContractCache } from './tx_contract_cache.js';

/**
 * Implements the PublicContractsDB using a ContractDataSource.
 * Progressively records contracts in transaction as they are processed in a block.
 * Separates block-level contract information (from processed/included txs) from the
 * current tx's contract information (which may be cleared on tx revert/death).
 */
export class ContractsDataSourcePublicDB implements PublicContractsDB {
  // The three caching layers.
  // The current tx's new contract information is cached
  // in currentTxNonRevertibleCache and currentTxRevertibleCache.
  // When a tx succeeds, that cache is merged into the block cache and cleared.
  private blockCache = new TxContractCache();
  private currentTxNonRevertibleCache = new TxContractCache();
  private currentTxRevertibleCache = new TxContractCache();
  private bytecodeCommitmentCache = new Map<string, Fr>();

  private log = createLogger('simulator:contracts-data-source');

  constructor(private dataSource: ContractDataSource) {}

  /**
   * Add new contracts from a transaction
   * @param tx - The transaction to add contracts from.
   */
  public async addNewContracts(tx: Tx): Promise<void> {
    await this.addContractClasses(tx);
    this.addContractInstances(tx);
  }

  /**
   * Add contract classes from a transaction
   * @param tx - The transaction to add contract classes from.
   */
  private async addContractClasses(tx: Tx) {
    // Extract contract class and instance data from logs and add to cache for this block

    // Extract contract class from logs
    const siloedNonRevertibleContractClassLogs = tx.data.forPublic
      ? await tx.filterContractClassLogs(
          tx.data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes,
          /*siloed=*/ true,
        )
      : await tx.filterContractClassLogs(tx.data.forRollup!.end.contractClassLogsHashes, /*siloed=*/ true);
    const siloedRevertibleContractClassLogs = tx.data.forPublic
      ? await tx.filterContractClassLogs(
          tx.data.forPublic!.revertibleAccumulatedData.contractClassLogsHashes,
          /*siloed=*/ true,
        )
      : [];
    const nonRevertibleContractClassEvents = siloedNonRevertibleContractClassLogs
      .filter((log: ContractClassLog) => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log))
      .map((log: ContractClassLog) => ContractClassRegisteredEvent.fromLog(log));
    const revertibleContractClassEvents = siloedRevertibleContractClassLogs
      .filter((log: ContractClassLog) => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log))
      .map((log: ContractClassLog) => ContractClassRegisteredEvent.fromLog(log));

    // Cache contract classes
    await Promise.all(
      nonRevertibleContractClassEvents.map(async (event: ContractClassRegisteredEvent) => {
        this.log.debug(`Adding class ${event.contractClassId.toString()} to contract 's non-revertible tx cache`);
        const contractClass = await event.toContractClassPublic();

        this.currentTxNonRevertibleCache.addClass(event.contractClassId, contractClass);
      }),
    );

    await Promise.all(
      revertibleContractClassEvents.map(async (event: ContractClassRegisteredEvent) => {
        this.log.debug(`Adding class ${event.contractClassId.toString()} to contract's revertible tx cache`);
        const contractClass = await event.toContractClassPublic();

        this.currentTxRevertibleCache.addClass(event.contractClassId, contractClass);
      }),
    );
  }

  /**
   * Add contract instances from a transaction
   * @param tx - The transaction to add contract instances from.
   */
  private addContractInstances(tx: Tx) {
    // Extract contract instance from logs
    const nonRevertibleContractInstanceLogs = tx.data.forPublic
      ? tx.data.forPublic!.nonRevertibleAccumulatedData.privateLogs.filter(l => !l.isEmpty())
      : tx.data.forRollup!.end.privateLogs.filter(l => !l.isEmpty());
    const revertibleContractInstanceLogs = tx.data.forPublic
      ? tx.data.forPublic!.revertibleAccumulatedData.privateLogs.filter(l => !l.isEmpty())
      : [];

    const nonRevertibleContractInstanceEvents = nonRevertibleContractInstanceLogs
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log))
      .map(log => ContractInstanceDeployedEvent.fromLog(log));

    const revertibleContractInstanceEvents = revertibleContractInstanceLogs
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log))
      .map(log => ContractInstanceDeployedEvent.fromLog(log));

    // Cache contract instances
    nonRevertibleContractInstanceEvents.forEach(e => {
      this.log.debug(
        `Adding instance ${e.address.toString()} with class ${e.contractClassId.toString()} to non-revertible tx contract cache`,
      );
      this.currentTxNonRevertibleCache.addInstance(e.address, e.toContractInstance());
    });
    revertibleContractInstanceEvents.forEach(e => {
      this.log.debug(
        `Adding instance ${e.address.toString()} with class ${e.contractClassId.toString()} to revertible tx contract cache`,
      );
      this.currentTxRevertibleCache.addInstance(e.address, e.toContractInstance());
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

  public async getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    // Check caches in order: tx revertible -> tx non-revertible -> block -> data source
    return (
      this.currentTxRevertibleCache.getInstance(address) ??
      this.currentTxNonRevertibleCache.getInstance(address) ??
      this.blockCache.getInstance(address) ??
      (await this.dataSource.getContract(address))
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
    return await this.dataSource.getContractFunctionName(address, selector);
  }
}

/**
 * A public state DB that reads and writes to the world state.
 */
export class WorldStateDB extends ContractsDataSourcePublicDB implements PublicStateDB, MerkleTreeCheckpointOperations {
  private logger = createLogger('simulator:world-state-db');

  constructor(public db: MerkleTreeWriteOperations, dataSource: ContractDataSource) {
    super(dataSource);
  }

  /**
   * Checkpoints the current fork state
   */
  public async createCheckpoint() {
    await this.db.createCheckpoint();
  }

  /**
   * Commits the current checkpoint
   */
  public async commitCheckpoint() {
    await this.db.commitCheckpoint();
  }

  /**
   * Reverts the current checkpoint
   */
  public async revertCheckpoint() {
    await this.db.revertCheckpoint();
  }

  public getMerkleInterface(): MerkleTreeWriteOperations {
    return this.db;
  }

  /**
   * Reads a value from public storage, returning zero if none.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @returns The current value in the storage slot.
   */
  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    return await readPublicState(this.db, contract, slot);
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
    await this.db.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()]);
  }

  public async getL1ToL2LeafValue(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.db.getLeafValue(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);
    this.logger.debug(`[DB] Fetched L1 to L2 message leaf value`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getCommitmentValue(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.db.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
    this.logger.debug(`[DB] Fetched commitment leaf value`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-commitment-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getNullifierIndex(nullifier: Fr): Promise<bigint | undefined> {
    const timer = new Timer();
    const index = (await this.db.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]))[0];
    this.logger.debug(`[DB] Fetched nullifier index`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-nullifier-index',
    } satisfies PublicDBAccessStats);
    return index;
  }
}

export async function readPublicState(db: MerkleTreeReadOperations, contract: AztecAddress, slot: Fr): Promise<Fr> {
  const leafSlot = (await computePublicDataTreeLeafSlot(contract, slot)).toBigInt();

  const lowLeafResult = await db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
  if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
    return Fr.ZERO;
  }

  const preimage = (await db.getLeafPreimage(
    MerkleTreeId.PUBLIC_DATA_TREE,
    lowLeafResult.index,
  )) as PublicDataTreeLeafPreimage;

  return preimage.value;
}
