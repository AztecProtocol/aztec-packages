import {
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  NullifierMembershipWitness,
  type Tx,
} from '@aztec/circuit-types';
import { type PublicDBAccessStats } from '@aztec/circuit-types/stats';
import {
  type AztecAddress,
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  Fr,
  type FunctionSelector,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type NullifierLeafPreimage,
  type PublicDataTreeLeafPreimage,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { computeL1ToL2MessageNullifier, computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ContractClassRegisteredEvent, ContractInstanceDeployedEvent } from '@aztec/protocol-contracts';
import {
  type CommitmentsDB,
  MessageLoadOracleInputs,
  type PublicContractsDB,
  type PublicStateDB,
} from '@aztec/simulator';

/**
 * Implements the PublicContractsDB using a ContractDataSource.
 * Progressively records contracts in transaction as they are processed in a block.
 */
export class ContractsDataSourcePublicDB implements PublicContractsDB {
  private instanceCache = new Map<string, ContractInstanceWithAddress>();
  private classCache = new Map<string, ContractClassPublic>();
  private bytecodeCommitmentCache = new Map<string, Fr>();

  private log = createDebugLogger('aztec:sequencer:contracts-data-source');

  constructor(private dataSource: ContractDataSource) {}
  /**
   * Add new contracts from a transaction
   * @param tx - The transaction to add contracts from.
   */
  public addNewContracts(tx: Tx): Promise<void> {
    // Extract contract class and instance data from logs and add to cache for this block
    const logs = tx.contractClassLogs.unrollLogs();
    logs
      .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log.data))
      .forEach(log => {
        const event = ContractClassRegisteredEvent.fromLog(log.data);
        this.log.debug(`Adding class ${event.contractClassId.toString()} to public execution contract cache`);
        this.classCache.set(event.contractClassId.toString(), event.toContractClassPublic());
      });

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

    return Promise.resolve();
  }

  /**
   * Removes new contracts added from transactions
   * @param tx - The tx's contracts to be removed
   */
  public removeNewContracts(tx: Tx): Promise<void> {
    // TODO(@spalladino): Can this inadvertently delete a valid contract added by another tx?
    // Let's say we have two txs adding the same contract on the same block. If the 2nd one reverts,
    // wouldn't that accidentally remove the contract added on the first one?
    const logs = tx.contractClassLogs.unrollLogs();
    logs
      .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log.data))
      .forEach(log => {
        const event = ContractClassRegisteredEvent.fromLog(log.data);
        this.classCache.delete(event.contractClassId.toString());
      });

    // We store the contract instance deployed event log in private logs, contract_instance_deployer_contract/src/main.nr
    const contractInstanceEvents = tx.data
      .getNonEmptyPrivateLogs()
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

    const value = computePublicBytecodeCommitment(contractClass.packedBytecode);
    this.bytecodeCommitmentCache.set(key, value);
    return value;
  }

  async getBytecode(address: AztecAddress, selector: FunctionSelector): Promise<Buffer | undefined> {
    const instance = await this.getContractInstance(address);
    if (!instance) {
      throw new Error(`Contract ${address.toString()} not found`);
    }
    const contractClass = await this.getContractClass(instance.contractClassId);
    if (!contractClass) {
      throw new Error(`Contract class ${instance.contractClassId.toString()} for ${address.toString()} not found`);
    }
    return contractClass.publicFunctions.find(f => f.selector.equals(selector))?.bytecode;
  }

  public async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return await this.dataSource.getContractFunctionName(address, selector);
  }
}

/**
 * A public state DB that reads and writes to the world state.
 */
export class WorldStateDB extends ContractsDataSourcePublicDB implements PublicStateDB, CommitmentsDB {
  private logger = createDebugLogger('aztec:sequencer:world-state-db');

  private publicCommittedWriteCache: Map<bigint, Fr> = new Map();
  private publicCheckpointedWriteCache: Map<bigint, Fr> = new Map();
  private publicUncommittedWriteCache: Map<bigint, Fr> = new Map();

  constructor(private db: MerkleTreeWriteOperations, dataSource: ContractDataSource) {
    super(dataSource);
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
    const leafSlot = computePublicDataTreeLeafSlot(contract, slot).value;
    const uncommitted = this.publicUncommittedWriteCache.get(leafSlot);
    if (uncommitted !== undefined) {
      return uncommitted;
    }
    const checkpointed = this.publicCheckpointedWriteCache.get(leafSlot);
    if (checkpointed !== undefined) {
      return checkpointed;
    }
    const committed = this.publicCommittedWriteCache.get(leafSlot);
    if (committed !== undefined) {
      return committed;
    }

    return await readPublicState(this.db, contract, slot);
  }

  /**
   * Records a write to public storage.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @param newValue - The new value to store.
   * @returns The slot of the written leaf in the public data tree.
   */
  public storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<bigint> {
    const index = computePublicDataTreeLeafSlot(contract, slot).value;
    this.publicUncommittedWriteCache.set(index, newValue);
    return Promise.resolve(index);
  }

  public async getNullifierMembershipWitnessAtLatestBlock(
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const timer = new Timer();
    const index = await this.db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    if (!index) {
      return undefined;
    }

    const leafPreimagePromise = this.db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    const siblingPathPromise = this.db.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      BigInt(index),
    );

    const [leafPreimage, siblingPath] = await Promise.all([leafPreimagePromise, siblingPathPromise]);

    if (!leafPreimage) {
      return undefined;
    }

    this.logger.debug(`[DB] Fetched nullifier membership`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-nullifier-membership-witness-at-latest-block',
    } satisfies PublicDBAccessStats);

    return new NullifierMembershipWitness(BigInt(index), leafPreimage as NullifierLeafPreimage, siblingPath);
  }

  public async getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    const timer = new Timer();

    const messageIndex = await this.db.findLeafIndex(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, messageHash);
    if (messageIndex === undefined) {
      throw new Error(`No L1 to L2 message found for message hash ${messageHash.toString()}`);
    }

    const messageNullifier = computeL1ToL2MessageNullifier(contractAddress, messageHash, secret);
    const nullifierIndex = await this.getNullifierIndex(messageNullifier);

    if (nullifierIndex !== undefined) {
      throw new Error(`No non-nullified L1 to L2 message found for message hash ${messageHash.toString()}`);
    }

    const siblingPath = await this.db.getSiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      messageIndex,
    );

    this.logger.debug(`[DB] Fetched L1 to L2 message membership`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-membership-witness',
    } satisfies PublicDBAccessStats);

    return new MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>(messageIndex, siblingPath);
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

  public async getCommitmentIndex(commitment: Fr): Promise<bigint | undefined> {
    const timer = new Timer();
    const index = await this.db.findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, commitment);
    this.logger.debug(`[DB] Fetched commitment index`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-commitment-index',
    } satisfies PublicDBAccessStats);
    return index;
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
    const index = await this.db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    this.logger.debug(`[DB] Fetched nullifier index`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-nullifier-index',
    } satisfies PublicDBAccessStats);
    return index;
  }

  /**
   * Commit the pending public changes to the DB.
   * @returns Nothing.
   */
  commit(): Promise<void> {
    for (const [k, v] of this.publicCheckpointedWriteCache) {
      this.publicCommittedWriteCache.set(k, v);
    }
    // uncommitted writes take precedence over checkpointed writes
    // since they are the most recent
    for (const [k, v] of this.publicUncommittedWriteCache) {
      this.publicCommittedWriteCache.set(k, v);
    }
    return this.rollbackToCommit();
  }

  /**
   * Rollback the pending public changes.
   * @returns Nothing.
   */
  async rollbackToCommit(): Promise<void> {
    await this.rollbackToCheckpoint();
    this.publicCheckpointedWriteCache = new Map<bigint, Fr>();
    return Promise.resolve();
  }

  checkpoint(): Promise<void> {
    for (const [k, v] of this.publicUncommittedWriteCache) {
      this.publicCheckpointedWriteCache.set(k, v);
    }
    return this.rollbackToCheckpoint();
  }

  rollbackToCheckpoint(): Promise<void> {
    this.publicUncommittedWriteCache = new Map<bigint, Fr>();
    return Promise.resolve();
  }
}

export async function readPublicState(db: MerkleTreeReadOperations, contract: AztecAddress, slot: Fr): Promise<Fr> {
  const leafSlot = computePublicDataTreeLeafSlot(contract, slot).toBigInt();

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
