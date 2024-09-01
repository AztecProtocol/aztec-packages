import {
  type AuthWitness,
  type AztecNode,
  type CompleteAddress,
  MerkleTreeId,
  type NoteStatus,
  type NullifierMembershipWitness,
  type PublicDataWitness,
} from '@aztec/circuit-types';
import { type Header, type KeyValidationRequest } from '@aztec/circuits.js';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { applyStringFormatting, createDebugLogger } from '@aztec/foundation/log';
import { type ContractInstance } from '@aztec/types/contracts';

import { type NoteData, TypedOracle } from '../acvm/index.js';
import { type DBOracle } from './db_oracle.js';
import { pickNotes } from './pick_notes.js';

/**
 * The execution context for a client view tx simulation.
 * It only reads data from data sources. Nothing will be updated or created during this simulation.
 */
export class ViewDataOracle extends TypedOracle {
  constructor(
    protected readonly contractAddress: AztecAddress,
    /** List of transient auth witnesses to be used during this simulation */
    protected readonly authWitnesses: AuthWitness[],
    protected readonly db: DBOracle,
    protected readonly aztecNode: AztecNode,
    protected log = createDebugLogger('aztec:simulator:client_view_context'),
    protected readonly scopes?: AztecAddress[],
  ) {
    super();
  }

  public override getBlockNumber(): Promise<number> {
    return this.aztecNode.getBlockNumber();
  }

  public override getContractAddress(): Promise<AztecAddress> {
    return Promise.resolve(this.contractAddress);
  }

  public override getChainId(): Promise<Fr> {
    return Promise.resolve(this.aztecNode.getChainId().then(id => new Fr(id)));
  }

  public override getVersion(): Promise<Fr> {
    return Promise.resolve(this.aztecNode.getVersion().then(v => new Fr(v)));
  }

  /**
   * Retrieve keys associated with a specific master public key and app address.
   * @param pkMHash - The master public key hash.
   * @returns A Promise that resolves to nullifier keys.
   * @throws If the keys are not registered in the key store.
   */
  public override getKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.db.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  /**
   * Fetches the index and sibling path of a leaf at a given block from a given tree.
   * @param blockNumber - The block number at which to get the membership witness.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param leafValue - The leaf value
   * @returns The index and sibling path concatenated [index, sibling_path]
   */
  public override async getMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
    const index = await this.db.findLeafIndex(blockNumber, treeId, leafValue);
    if (!index) {
      throw new Error(`Leaf value: ${leafValue} not found in ${MerkleTreeId[treeId]}`);
    }
    const siblingPath = await this.db.getSiblingPath(blockNumber, treeId, index);
    return [new Fr(index), ...siblingPath];
  }

  /**
   * Fetches a sibling path at a given block and index from a tree specified by `treeId`.
   * @param blockNumber - The block number at which to get the membership witness.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param leafIndex - Index of the leaf to get sibling path for
   * @returns The sibling path.
   */
  public override getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: Fr): Promise<Fr[]> {
    return this.db.getSiblingPath(blockNumber, treeId, leafIndex.toBigInt());
  }

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  public override async getNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return await this.db.getNullifierMembershipWitness(blockNumber, nullifier);
  }

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  public override async getLowNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return await this.db.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param leafSlot - The slot of the public data tree to get the witness for.
   * @returns - The witness
   */
  public override async getPublicDataTreeWitness(
    blockNumber: number,
    leafSlot: Fr,
  ): Promise<PublicDataWitness | undefined> {
    return await this.db.getPublicDataTreeWitness(blockNumber, leafSlot);
  }

  /**
   * Fetches a block header of a given block.
   * @param blockNumber - The number of a block of which to get the block header.
   * @returns Block extracted from a block with block number `blockNumber`.
   */
  public override async getHeader(blockNumber: number): Promise<Header | undefined> {
    const block = await this.db.getBlock(blockNumber);
    if (!block) {
      return undefined;
    }
    return block.header;
  }

  /**
   * Retrieve the complete address associated to a given address.
   * @param account - The account address.
   * @returns A complete address associated with the input address.
   * @throws An error if the account is not registered in the database.
   */
  public override getCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
    return this.db.getCompleteAddress(account);
  }

  /**
   * Returns a contract instance associated with an address or throws if not found.
   * @param address - Address.
   * @returns A contract instance.
   */
  public override getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    return this.db.getContractInstance(address);
  }

  /**
   * Returns an auth witness for the given message hash. Checks on the list of transient witnesses
   * for this transaction first, and falls back to the local database if not found.
   * @param messageHash - Hash of the message to authenticate.
   * @returns Authentication witness for the requested message hash.
   */
  public override getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    return Promise.resolve(
      this.authWitnesses.find(w => w.requestHash.equals(messageHash))?.witness ?? this.db.getAuthWitness(messageHash),
    );
  }

  /**
   * Pops a capsule from the capsule dispenser
   * @returns The capsule values
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle.
   */
  public override popCapsule(): Promise<Fr[]> {
    return this.db.popCapsule();
  }

  /**
   * Gets some notes for a contract address and storage slot.
   * Returns a flattened array containing filtered notes.
   *
   * @remarks
   * Check for pending notes with matching slot.
   * Real notes coming from DB will have a leafIndex which
   * represents their index in the note hash tree.
   *
   * @param storageSlot - The storage slot.
   * @param numSelects - The number of valid selects in selectBy and selectValues.
   * @param selectBy - An array of indices of the fields to selects.
   * @param selectValues - The values to match.
   * @param selectComparators - The comparators to use to match values.
   * @param sortBy - An array of indices of the fields to sort.
   * @param sortOrder - The order of the corresponding index in sortBy. (1: DESC, 2: ASC, 0: Do nothing)
   * @param limit - The number of notes to retrieve per query.
   * @param offset - The starting index for pagination.
   * @param status - The status of notes to fetch.
   * @returns Array of note data.
   */
  public override async getNotes(
    storageSlot: Fr,
    numSelects: number,
    selectByIndexes: number[],
    selectByOffsets: number[],
    selectByLengths: number[],
    selectValues: Fr[],
    selectComparators: number[],
    sortByIndexes: number[],
    sortByOffsets: number[],
    sortByLengths: number[],
    sortOrder: number[],
    limit: number,
    offset: number,
    status: NoteStatus,
  ): Promise<NoteData[]> {
    const dbNotes = await this.db.getNotes(this.contractAddress, storageSlot, status, this.scopes);
    return pickNotes<NoteData>(dbNotes, {
      selects: selectByIndexes.slice(0, numSelects).map((index, i) => ({
        selector: { index, offset: selectByOffsets[i], length: selectByLengths[i] },
        value: selectValues[i],
        comparator: selectComparators[i],
      })),
      sorts: sortByIndexes.map((index, i) => ({
        selector: { index, offset: sortByOffsets[i], length: sortByLengths[i] },
        order: sortOrder[i],
      })),
      limit,
      offset,
    });
  }

  /**
   * Check if a nullifier exists in the nullifier tree.
   * @param innerNullifier - The inner nullifier.
   * @returns A boolean indicating whether the nullifier exists in the tree or not.
   */
  public override async checkNullifierExists(innerNullifier: Fr) {
    const nullifier = siloNullifier(this.contractAddress, innerNullifier!);
    const index = await this.db.getNullifierIndex(nullifier);
    return index !== undefined;
  }

  /**
   * Fetches a message from the db, given its key.
   * @param contractAddress - Address of a contract by which the message was emitted.
   * @param messageHash - Hash of the message.
   * @param secret - Secret used to compute a nullifier.
   * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  public override async getL1ToL2MembershipWitness(contractAddress: AztecAddress, messageHash: Fr, secret: Fr) {
    return await this.db.getL1ToL2MembershipWitness(contractAddress, messageHash, secret);
  }

  /**
   * Read the public storage data.
   * @param contractAddress - The address to read storage from.
   * @param startStorageSlot - The starting storage slot.
   * @param blockNumber - The block number to read storage at.
   * @param numberOfElements - Number of elements to read from the starting storage slot.
   */
  public override async storageRead(
    contractAddress: Fr,
    startStorageSlot: Fr,
    blockNumber: number,
    numberOfElements: number,
  ) {
    const values = [];
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = new Fr(startStorageSlot.value + i);
      const value = await this.aztecNode.getPublicStorageAt(contractAddress, storageSlot, blockNumber);

      this.log.debug(
        `Oracle storage read: slot=${storageSlot.toString()} address-${contractAddress.toString()} value=${value}`,
      );
      values.push(value);
    }
    return values;
  }

  public override debugLog(message: string, fields: Fr[]): void {
    const formattedStr = applyStringFormatting(message, fields);
    this.log.verbose(`debug_log ${formattedStr}`);
  }
}
