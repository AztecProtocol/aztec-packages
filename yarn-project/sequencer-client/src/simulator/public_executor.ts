import {
  CommitmentDataOracleInputs,
  CommitmentsDB,
  MessageLoadOracleInputs,
  PublicContractsDB,
  PublicExecutor,
  PublicStateDB,
} from '@aztec/acir-simulator';
import { AztecAddress, CircuitsWasm, EthAddress, Fr, PrivateHistoricTreeRoots } from '@aztec/circuits.js';
import { siloCommitment } from '@aztec/circuits.js/abis';
import { ContractDataSource, L1ToL2MessageSource, MerkleTreeId } from '@aztec/types';
import { MerkleTreeOperations, computePublicDataTreeLeafIndex } from '@aztec/world-state';

/**
 * Returns a new PublicExecutor simulator backed by the supplied merkle tree db and contract data source.
 * @param merkleTree - A merkle tree database.
 * @param contractDataSource - A contract data source.
 * @returns A new instance of a PublicExecutor.
 */
export function getPublicExecutor(
  merkleTree: MerkleTreeOperations,
  contractDataSource: ContractDataSource,
  l1toL2MessageSource: L1ToL2MessageSource,
) {
  return new PublicExecutor(
    new WorldStatePublicDB(merkleTree),
    new ContractsDataSourcePublicDB(contractDataSource),
    new WorldStateDB(merkleTree, l1toL2MessageSource),
  );
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
    const index = computePublicDataTreeLeafIndex(contract, slot, await CircuitsWasm.get());
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
    const index = computePublicDataTreeLeafIndex(contract, slot, await CircuitsWasm.get());
    this.writeCache.set(index, newValue);
  }
}

/**
 * Implements WorldState db using a world state database.
 */
export class WorldStateDB implements CommitmentsDB {
  constructor(private db: MerkleTreeOperations, private l1ToL2MessageSource: L1ToL2MessageSource) {}

  /**
   * Gets a confirmed L1 to L2 message for the given message key.
   * TODO(Maddiaa): Can be combined with aztec-node method that does the same thing.
   * @param messageKey - The message Key.
   * @returns - The l1 to l2 message object
   */
  public async getL1ToL2Message(messageKey: Fr): Promise<MessageLoadOracleInputs> {
    // todo: #697 - make this one lookup.
    const message = await this.l1ToL2MessageSource.getConfirmedL1ToL2Message(messageKey);
    const index = (await this.db.findLeafIndex(MerkleTreeId.L1_TO_L2_MESSAGES_TREE, messageKey.toBuffer()))!;
    const siblingPath = await this.db.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGES_TREE, index);

    return {
      message: message.toFieldArray(),
      index,
      siblingPath: siblingPath.toFieldArray(),
    };
  }

  /**
   * Gets a message index and sibling path to some commitment in the private data tree.
   * @param address - The contract address owning storage.
   * @param commitment - The preimage of the siloed data.
   * @returns - The Commitment data oracle object
   */
  public async getCommitmentOracle(address: AztecAddress, commitment: Fr): Promise<CommitmentDataOracleInputs> {
    const siloedCommitment = siloCommitment(await CircuitsWasm.get(), address, commitment);
    const index = (await this.db.findLeafIndex(MerkleTreeId.PRIVATE_DATA_TREE, siloedCommitment.toBuffer()))!;
    const siblingPath = await this.db.getSiblingPath(MerkleTreeId.PRIVATE_DATA_TREE, index);

    return {
      commitment: siloedCommitment,
      index,
      siblingPath: siblingPath.toFieldArray(),
    };
  }

  /**
   * Gets the current tree roots from the merkle db.
   * @returns current tree roots.
   */
  public getTreeRoots(): PrivateHistoricTreeRoots {
    const roots = this.db.getCommitmentTreeRoots();

    return PrivateHistoricTreeRoots.from({
      privateKernelVkTreeRoot: Fr.ZERO,
      privateDataTreeRoot: Fr.fromBuffer(roots.privateDataTreeRoot),
      contractTreeRoot: Fr.fromBuffer(roots.contractDataTreeRoot),
      nullifierTreeRoot: Fr.fromBuffer(roots.nullifierTreeRoot),
      l1ToL2MessagesTreeRoot: Fr.fromBuffer(roots.l1Tol2MessagesTreeRoot),
    });
  }
}
