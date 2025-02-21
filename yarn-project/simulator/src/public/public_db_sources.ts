import { ContractClassTxL2Logs, MerkleTreeId, type Tx } from '@aztec/circuit-types';
import {
  type MerkleTreeCheckpointOperations,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
} from '@aztec/circuit-types/interfaces/server';
import { type PublicDBAccessStats } from '@aztec/circuit-types/stats';
import {
  type AztecAddress,
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  Fr,
  type FunctionSelector,
  PublicDataWrite,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { type PublicDataTreeLeafPreimage } from '@aztec/circuits.js/trees';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ContractClassRegisteredEvent } from '@aztec/protocol-contracts/class-registerer';
import { ContractInstanceDeployedEvent } from '@aztec/protocol-contracts/instance-deployer';

import { type PublicContractsDB, type PublicStateDB } from './db_interfaces.js';

/**
 * Implements the PublicContractsDB using a ContractDataSource.
 * Progressively records contracts in transaction as they are processed in a block.
 */
export class ContractsDataSourcePublicDB implements PublicContractsDB {
  private instanceCache = new Map<string, ContractInstanceWithAddress>();
  private classCache = new Map<string, ContractClassPublic>();
  private bytecodeCommitmentCache = new Map<string, Fr>();

  private log = createLogger('simulator:contracts-data-source');

  constructor(private dataSource: ContractDataSource) {}
  /**
   * Add new contracts from a transaction
   * @param tx - The transaction to add contracts from.
   */
  public async addNewContracts(tx: Tx): Promise<void> {
    // Extract contract class and instance data from logs and add to cache for this block
    const logs = tx.contractClassLogs.unrollLogs();
    const contractClassRegisteredEvents = logs
      .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log.data))
      .map(log => ContractClassRegisteredEvent.fromLog(log.data));
    await Promise.all(
      contractClassRegisteredEvents.map(async event => {
        this.log.debug(`Adding class ${event.contractClassId.toString()} to public execution contract cache`);
        this.classCache.set(event.contractClassId.toString(), await event.toContractClassPublic());
      }),
    );

    // We store the contract instance deployed event log in private logs, contract_instance_deployer_contract/src/main.nr
    const contractInstanceEvents = tx.data
      .getNonEmptyPrivateLogs()
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log))
      .map(ContractInstanceDeployedEvent.fromLog);
    contractInstanceEvents.forEach(e => {
      this.log.debug(
        `Adding instance ${e.address.toString()} with class ${e.contractClassId.toString()} to public execution contract cache`,
      );
      this.instanceCache.set(e.address.toString(), e.toContractInstance());
    });
  }

  /**
   * Removes new contracts added from transactions
   * @param tx - The tx's contracts to be removed
   * @param onlyRevertible - Whether to only remove contracts added from revertible contract class logs
   */
  public removeNewContracts(tx: Tx, onlyRevertible: boolean = false): Promise<void> {
    // TODO(@spalladino): Can this inadvertently delete a valid contract added by another tx?
    // Let's say we have two txs adding the same contract on the same block. If the 2nd one reverts,
    // wouldn't that accidentally remove the contract added on the first one?
    const contractClassLogs = onlyRevertible
      ? tx.contractClassLogs
          .filterScoped(
            tx.data.forPublic!.revertibleAccumulatedData.contractClassLogsHashes,
            ContractClassTxL2Logs.empty(),
          )
          .unrollLogs()
      : tx.contractClassLogs.unrollLogs();
    contractClassLogs
      .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log.data))
      .forEach(log => {
        const event = ContractClassRegisteredEvent.fromLog(log.data);
        this.classCache.delete(event.contractClassId.toString());
      });

    // We store the contract instance deployed event log in private logs, contract_instance_deployer_contract/src/main.nr
    const privateLogs = onlyRevertible
      ? tx.data.forPublic!.revertibleAccumulatedData.privateLogs.filter(l => !l.isEmpty())
      : tx.data.getNonEmptyPrivateLogs();
    const contractInstanceEvents = privateLogs
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log))
      .map(ContractInstanceDeployedEvent.fromLog);
    contractInstanceEvents.forEach(e => this.instanceCache.delete(e.address.toString()));

    return Promise.resolve();
  }

  public async getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.instanceCache.get(address.toString()) ?? (await this.dataSource.getContract(address));
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    return this.classCache.get(contractClassId.toString()) ?? (await this.dataSource.getContractClass(contractClassId));
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
