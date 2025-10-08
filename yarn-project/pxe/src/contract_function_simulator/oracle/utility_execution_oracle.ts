import { Aes128 } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { LogLevels, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { NoteStatus } from '@aztec/stdlib/note';
import { type MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, Capsule } from '@aztec/stdlib/tx';

import type { ExecutionDataProvider } from '../execution_data_provider.js';
import { UtilityContext } from '../noir-structs/utility_context.js';
import { pickNotes } from '../pick_notes.js';
import type { IMiscOracle, IUtilityExecutionOracle, NoteData } from './interfaces.js';

/**
 * The oracle for an execution of utility contract functions.
 */
export class UtilityExecutionOracle implements IMiscOracle, IUtilityExecutionOracle {
  isMisc = true as const;
  isUtility = true as const;

  constructor(
    protected readonly contractAddress: AztecAddress,
    /** List of transient auth witnesses to be used during this simulation */
    protected readonly authWitnesses: AuthWitness[],
    protected readonly capsules: Capsule[], // TODO(#12425): Rename to transientCapsules
    protected readonly executionDataProvider: ExecutionDataProvider,
    protected log = createLogger('simulator:client_view_context'),
    protected readonly scopes?: AztecAddress[],
  ) {}

  public utilityAssertCompatibleOracleVersion(version: number): void {
    this.executionDataProvider.assertCompatibleOracleVersion(version);
  }

  public utilityGetRandomField(): Fr {
    return Fr.random();
  }

  public async utilityGetUtilityContext(): Promise<UtilityContext> {
    const blockHeader = await this.executionDataProvider.getAnchorBlockHeader();
    return UtilityContext.from({
      blockNumber: blockHeader.globalVariables.blockNumber,
      timestamp: blockHeader.globalVariables.timestamp,
      contractAddress: this.contractAddress,
      version: blockHeader.globalVariables.version,
      chainId: blockHeader.globalVariables.chainId,
    });
  }

  /**
   * Retrieve keys associated with a specific master public key and app address.
   * @param pkMHash - The master public key hash.
   * @returns A Promise that resolves to nullifier keys.
   * @throws If the keys are not registered in the key store.
   */
  public utilityGetKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.executionDataProvider.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  /**
   * Fetches the index and sibling path of a leaf at a given block from a given tree.
   * @param blockNumber - The block number at which to get the membership witness.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param leafValue - The leaf value
   * @returns The index and sibling path concatenated [index, sibling_path]
   */
  public utilityGetMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
    return this.executionDataProvider.getMembershipWitness(blockNumber, treeId, leafValue);
  }

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  public async utilityGetNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return await this.executionDataProvider.getNullifierMembershipWitness(blockNumber, nullifier);
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
  public async utilityGetLowNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return await this.executionDataProvider.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param leafSlot - The slot of the public data tree to get the witness for.
   * @returns - The witness
   */
  public async utilityGetPublicDataWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return await this.executionDataProvider.getPublicDataWitness(blockNumber, leafSlot);
  }

  /**
   * Fetches a block header of a given block.
   * @param blockNumber - The number of a block of which to get the block header.
   * @returns Block extracted from a block with block number `blockNumber`.
   */
  public async utilityGetBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
    const block = await this.executionDataProvider.getBlock(blockNumber);
    if (!block) {
      return undefined;
    }
    return block.getBlockHeader();
  }

  /**
   * Retrieve the complete address associated to a given address.
   * @param account - The account address.
   * @returns A complete address associated with the input address.
   * @throws An error if the account is not registered in the database.
   */
  public utilityGetPublicKeysAndPartialAddress(account: AztecAddress): Promise<CompleteAddress> {
    return this.executionDataProvider.getCompleteAddress(account);
  }

  /**
   * Returns a contract instance associated with an address or throws if not found.
   * @param address - Address.
   * @returns A contract instance.
   */
  public utilityGetContractInstance(address: AztecAddress): Promise<ContractInstance> {
    return this.executionDataProvider.getContractInstance(address);
  }

  /**
   * Returns an auth witness for the given message hash. Checks on the list of transient witnesses
   * for this transaction first, and falls back to the local database if not found.
   * @param messageHash - Hash of the message to authenticate.
   * @returns Authentication witness for the requested message hash.
   */
  public utilityGetAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    return Promise.resolve(this.authWitnesses.find(w => w.requestHash.equals(messageHash))?.witness);
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
  public async utilityGetNotes(
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
    const dbNotes = await this.executionDataProvider.getNotes(this.contractAddress, storageSlot, status, this.scopes);
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
  public async utilityCheckNullifierExists(innerNullifier: Fr) {
    const nullifier = await siloNullifier(this.contractAddress, innerNullifier!);
    const index = await this.executionDataProvider.getNullifierIndex(nullifier);
    return index !== undefined;
  }

  /**
   * Fetches a message from the executionDataProvider, given its key.
   * @param contractAddress - Address of a contract by which the message was emitted.
   * @param messageHash - Hash of the message.
   * @param secret - Secret used to compute a nullifier.
   * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  public async utilityGetL1ToL2MembershipWitness(contractAddress: AztecAddress, messageHash: Fr, secret: Fr) {
    return await this.executionDataProvider.getL1ToL2MembershipWitness(contractAddress, messageHash, secret);
  }

  /**
   * Read the public storage data.
   * @param contractAddress - The address to read storage from.
   * @param startStorageSlot - The starting storage slot.
   * @param blockNumber - The block number to read storage at.
   * @param numberOfElements - Number of elements to read from the starting storage slot.
   */
  public async utilityStorageRead(
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    blockNumber: number,
    numberOfElements: number,
  ) {
    const values = [];
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = new Fr(startStorageSlot.value + i);
      const value = await this.executionDataProvider.getPublicStorageAt(blockNumber, contractAddress, storageSlot);

      this.log.debug(
        `Oracle storage read: slot=${storageSlot.toString()} address-${contractAddress.toString()} value=${value}`,
      );
      values.push(value);
    }
    return values;
  }

  public utilityDebugLog(level: number, message: string, fields: Fr[]): void {
    if (!LogLevels[level]) {
      throw new Error(`Invalid debug log level: ${level}`);
    }
    const levelName = LogLevels[level];
    this.log[levelName](`${applyStringFormatting(message, fields)}`, { module: `${this.log.module}:debug_log` });
  }

  public async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    await this.executionDataProvider.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot, this.scopes);

    await this.executionDataProvider.syncNoteNullifiers(this.contractAddress);
  }

  public async utilityValidateEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
  ) {
    // TODO(#10727): allow other contracts to deliver notes
    if (!this.contractAddress.equals(contractAddress)) {
      throw new Error(`Got a note validation request from ${contractAddress}, expected ${this.contractAddress}`);
    }

    await this.executionDataProvider.validateEnqueuedNotesAndEvents(
      contractAddress,
      noteValidationRequestsArrayBaseSlot,
      eventValidationRequestsArrayBaseSlot,
    );
  }

  public async utilityBulkRetrieveLogs(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
  ) {
    // TODO(#10727): allow other contracts to process partial notes
    if (!this.contractAddress.equals(contractAddress)) {
      throw new Error(`Got a note validation request from ${contractAddress}, expected ${this.contractAddress}`);
    }

    await this.executionDataProvider.bulkRetrieveLogs(
      contractAddress,
      logRetrievalRequestsArrayBaseSlot,
      logRetrievalResponsesArrayBaseSlot,
    );
  }

  public utilityStoreCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.executionDataProvider.storeCapsule(this.contractAddress, slot, capsule);
  }

  public async utilityLoadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return (
      // TODO(#12425): On the following line, the pertinent capsule gets overshadowed by the transient one. Tackle this.
      this.capsules.find(c => c.contractAddress.equals(contractAddress) && c.storageSlot.equals(slot))?.data ??
      (await this.executionDataProvider.loadCapsule(this.contractAddress, slot))
    );
  }

  public utilityDeleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.executionDataProvider.deleteCapsule(this.contractAddress, slot);
  }

  public utilityCopyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
  ): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.executionDataProvider.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries);
  }

  // TODO(#11849): consider replacing this oracle with a pure Noir implementation of aes decryption.
  public utilityAes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  public utilityGetSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    return this.executionDataProvider.getSharedSecret(address, ephPk);
  }
}
