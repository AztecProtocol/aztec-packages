import { PublicContractsDB, PublicExecutor, PublicStateDB,  PublicExecutionContext, MessageLoadOracleInputs, DBOracle } from '@aztec/acir-simulator';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { AztecAddress, EthAddress, Fr, PrivateHistoricTreeRoots } from '@aztec/circuits.js';
import { ContractDataSource, L1ToL2MessageSource, MerkleTreeId } from '@aztec/types';
import { MerkleTreeOperations, computePublicDataTreeLeafIndex } from '@aztec/world-state';

/**
 * Returns a new PublicExecutor simulator backed by the supplied merkle tree db and contract data source.
 * @param merkleTree - A merkle tree database.
 * @param contractDataSource - A contract data source.
 * @returns A new instance of a PublicExecutor.
 */
export function getPublicExecutor(merkleTree: MerkleTreeOperations, contractDataSource: ContractDataSource, l1ToL2MessageSource: L1ToL2MessageSource, roots: PrivateHistoricTreeRoots) {

  // TODO(Maddiaa): might need to build the public execution context within here.
  const publicExecutionContext = new PublicExecutionContext(new WorldStatePublicDB(merkleTree), new ContractsDataSourcePublicDB(contractDataSource), new CommitmentsDb(merkleTree, l1ToL2MessageSource),  roots);
  return new PublicExecutor(publicExecutionContext);
}

/**
 * Implements the PublicContractsDB using a ContractDataSource.
 */
class ContractsDataSourcePublicDB implements PublicContractsDB {
  constructor(private db: ContractDataSource) {}
  async getBytecode(address: AztecAddress, functionSelector: Buffer): Promise<Buffer | undefined> {
    return (await this.db.getPublicFunction(address, functionSelector))?.bytecode;
  }
  async getPortalContractAddress(address: AztecAddress): Promise<EthAddress | undefined> {
    return (await this.db.getL2ContractInfo(address))?.portalContractAddress;
  }
}

/**
 * Implements the PublicStateDB using a world-state database.
 */
class WorldStatePublicDB implements PublicStateDB {
  private writeCache: Map<bigint, Fr> = new Map();

  constructor(private db: MerkleTreeOperations) {}

  /**
   * Reads a value from public storage, returning zero if none.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @returns The current value in the storage slot.
   */
  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const index = computePublicDataTreeLeafIndex(contract, slot, await BarretenbergWasm.get());
    const cached = this.writeCache.get(index);
    if (cached !== undefined) return cached;
    const value = await this.db.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, index);
    return value ? Fr.fromBuffer(value) : Fr.ZERO;
  }

  /**
   * Records a write to public storage.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @param newValue - The new value to store.
   */
  public async storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<void> {
    const index = computePublicDataTreeLeafIndex(contract, slot, await BarretenbergWasm.get());
    this.writeCache.set(index, newValue);
  }
}

/**
 * Implement the Commitments db in the public execution context.
 */
class CommitmentsDb implements DBOracle {

  constructor(private db: MerkleTreeOperations, private l1ToL2MessageSource: L1ToL2MessageSource) {}

  /**
   * Retrieves the L1ToL2Message associated with a specific message key
   * Throws an error if the message key is not found
   *
   * @param msgKey - The key of the message to be retrieved
   * @returns A promise that resolves to the message data, a sibling path and the
   *          index of the message in the the l1ToL2MessagesTree
   */
  async getL1ToL2Message(msgKey: Fr): Promise<MessageLoadOracleInputs> {
    const message = await this.l1ToL2MessageSource.getConfirmedL1ToL2Message(msgKey);
    // todo: #697 - make this one lookup.
    const index = (await this.db.findLeafIndex(
      MerkleTreeId.L1_TO_L2_MESSAGES_TREE,
      msgKey.toBuffer(),
    ))!;
    const siblingPath = await this.db.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGES_TREE, index);
    return {
      message: message.toFieldArray(),
      siblingPath: siblingPath.toFieldArray(),
      index,
    };
  }
}
