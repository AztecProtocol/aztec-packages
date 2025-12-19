import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Aes128 } from '@aztec/foundation/crypto/aes128';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { LogLevels, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { computeAddressSecret } from '@aztec/stdlib/keys';
import { deriveEcdhSharedSecret } from '@aztec/stdlib/logs';
import type { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, Capsule } from '@aztec/stdlib/tx';

import { EventService } from '../../events/event_service.js';
import { LogService } from '../../logs/log_service.js';
import { NoteService } from '../../notes/note_service.js';
import { ORACLE_VERSION } from '../../oracle_version.js';
import { PublicStorageService } from '../../public_storage/public_storage_service.js';
import type {
  AddressDataProvider,
  AnchorBlockDataProvider,
  CapsuleDataProvider,
  ContractDataProvider,
  NoteDataProvider,
  PrivateEventDataProvider,
  RecipientTaggingDataProvider,
  SenderTaggingDataProvider,
} from '../../storage/index.js';
import { TreeMembershipService } from '../../tree_membership/tree_membership_service.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import { UtilityContext } from '../noir-structs/utility_context.js';
import { pickNotes } from '../pick_notes.js';
import type { IMiscOracle, IUtilityExecutionOracle, NoteData } from './interfaces.js';
import { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

/**
 * The oracle for an execution of utility contract functions.
 */
export class UtilityExecutionOracle implements IMiscOracle, IUtilityExecutionOracle {
  isMisc = true as const;
  isUtility = true as const;

  private aztecNrDebugLog = createLogger('aztec-nr:debug_log');

  constructor(
    protected readonly contractAddress: AztecAddress,
    /** List of transient auth witnesses to be used during this simulation */
    protected readonly authWitnesses: AuthWitness[],
    protected readonly capsules: Capsule[], // TODO(#12425): Rename to transientCapsules
    protected readonly anchorBlockHeader: BlockHeader,
    protected readonly contractDataProvider: ContractDataProvider,
    protected readonly noteDataProvider: NoteDataProvider,
    protected readonly keyStore: KeyStore,
    protected readonly addressDataProvider: AddressDataProvider,
    protected readonly aztecNode: AztecNode,
    protected readonly anchorBlockDataProvider: AnchorBlockDataProvider,
    protected readonly senderTaggingDataProvider: SenderTaggingDataProvider,
    protected readonly recipientTaggingDataProvider: RecipientTaggingDataProvider,
    protected readonly capsuleDataProvider: CapsuleDataProvider,
    protected readonly privateEventDataProvider: PrivateEventDataProvider,
    protected log = createLogger('simulator:client_view_context'),
    protected readonly scopes?: AztecAddress[],
  ) {}

  public utilityAssertCompatibleOracleVersion(version: number): void {
    if (version !== ORACLE_VERSION) {
      throw new Error(`Incompatible oracle version. Expected version ${ORACLE_VERSION}, got ${version}.`);
    }
  }

  public utilityGetRandomField(): Fr {
    return Fr.random();
  }

  public utilityGetUtilityContext(): UtilityContext {
    return UtilityContext.from({
      blockNumber: this.anchorBlockHeader.globalVariables.blockNumber,
      timestamp: this.anchorBlockHeader.globalVariables.timestamp,
      contractAddress: this.contractAddress,
      version: this.anchorBlockHeader.globalVariables.version,
      chainId: this.anchorBlockHeader.globalVariables.chainId,
    });
  }

  /**
   * Retrieve keys associated with a specific master public key and app address.
   * @param pkMHash - The master public key hash.
   * @returns A Promise that resolves to nullifier keys.
   * @throws If the keys are not registered in the key store.
   */
  public utilityGetKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  /**
   * Fetches the index and sibling path of a leaf at a given block from a given tree.
   * @param blockNumber - The block number at which to get the membership witness.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param leafValue - The leaf value
   * @returns The index and sibling path concatenated [index, sibling_path]
   */
  public utilityGetMembershipWitness(blockNumber: BlockNumber, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
    const treeMembershipService = new TreeMembershipService(this.aztecNode, this.anchorBlockDataProvider);
    return treeMembershipService.getMembershipWitness(blockNumber, treeId, leafValue);
  }

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  public async utilityGetNullifierMembershipWitness(
    blockNumber: BlockNumber,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return await this.aztecNode.getNullifierMembershipWitness(blockNumber, nullifier);
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
    blockNumber: BlockNumber,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const treeMembershipService = new TreeMembershipService(this.aztecNode, this.anchorBlockDataProvider);
    return await treeMembershipService.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param leafSlot - The slot of the public data tree to get the witness for.
   * @returns - The witness
   */
  public async utilityGetPublicDataWitness(
    blockNumber: BlockNumber,
    leafSlot: Fr,
  ): Promise<PublicDataWitness | undefined> {
    const treeMembershipService = new TreeMembershipService(this.aztecNode, this.anchorBlockDataProvider);
    return await treeMembershipService.getPublicDataWitness(blockNumber, leafSlot);
  }

  /**
   * Fetches a block header of a given block.
   * @param blockNumber - The number of a block of which to get the block header.
   * @returns Block extracted from a block with block number `blockNumber`.
   */
  public async utilityGetBlockHeader(blockNumber: BlockNumber): Promise<BlockHeader | undefined> {
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
    if (blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }

    const block = await this.aztecNode.getBlock(blockNumber);
    return block?.getBlockHeader() || undefined;
  }

  /**
   * Retrieve the complete address associated to a given address.
   * @param account - The account address.
   * @returns A complete address associated with the input address.
   * @throws An error if the account is not registered in the database.
   */
  public utilityGetPublicKeysAndPartialAddress(account: AztecAddress): Promise<CompleteAddress> {
    return this.getCompleteAddress(account);
  }

  protected async getCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
    const completeAddress = await this.addressDataProvider.getCompleteAddress(account);
    if (!completeAddress) {
      throw new Error(
        `No public key registered for address ${account}.
        Register it by calling pxe.addAccount(...).\nSee docs for context: https://docs.aztec.network/developers/resources/debugging/aztecnr-errors#simulation-error-no-public-key-registered-for-address-0x0-register-it-by-calling-pxeregisterrecipient-or-pxeregisteraccount`,
      );
    }
    return completeAddress;
  }

  /**
   * Returns a contract instance associated with an address or throws if not found.
   * @param address - Address.
   * @returns A contract instance.
   */
  public utilityGetContractInstance(address: AztecAddress): Promise<ContractInstance> {
    return this.getContractInstance(address);
  }

  protected async getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    const instance = await this.contractDataProvider.getContractInstance(address);
    if (!instance) {
      throw new Error(`No contract instance found for address ${address.toString()}`);
    }
    return instance;
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
   * @param owner - The owner of the notes. If undefined, returns notes for all owners.
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
    owner: AztecAddress | undefined,
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
    const noteService = new NoteService(this.noteDataProvider, this.aztecNode, this.anchorBlockDataProvider);

    const dbNotes = await noteService.getNotes(this.contractAddress, owner, storageSlot, status, this.scopes);
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
    const treeMembershipService = new TreeMembershipService(this.aztecNode, this.anchorBlockDataProvider);
    const index = await treeMembershipService.getNullifierIndex(nullifier);
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
    const treeMembershipService = new TreeMembershipService(this.aztecNode, this.anchorBlockDataProvider);
    const [messageIndex, siblingPath] = await treeMembershipService.getL1ToL2MembershipWitness(
      contractAddress,
      messageHash,
      secret,
    );

    // Assuming messageIndex is what you intended to use for the index in MessageLoadOracleInputs
    return new MessageLoadOracleInputs(messageIndex, siblingPath);
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
    blockNumber: BlockNumber,
    numberOfElements: number,
  ) {
    const values = [];
    const publicStorageService = new PublicStorageService(this.anchorBlockDataProvider, this.aztecNode);

    // TODO: why do we serialize these requests? This should probably a single call
    // Privacy considerations?
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = new Fr(startStorageSlot.value + i);
      const value = await publicStorageService.getPublicStorageAt(blockNumber, contractAddress, storageSlot);

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
    this.aztecNrDebugLog[levelName](`${applyStringFormatting(message, fields)}`);
  }

  public async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    const logService = new LogService(
      this.aztecNode,
      this.anchorBlockDataProvider,
      this.keyStore,
      this.capsuleDataProvider,
      this.recipientTaggingDataProvider,
      this.addressDataProvider,
    );

    await logService.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot, this.scopes);

    const noteService = new NoteService(this.noteDataProvider, this.aztecNode, this.anchorBlockDataProvider);
    await noteService.syncNoteNullifiers(this.contractAddress);
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

    // We read all note and event validation requests and process them all concurrently. This makes the process much
    // faster as we don't need to wait for the network round-trip.
    const noteValidationRequests = (
      await this.capsuleDataProvider.readCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot)
    ).map(NoteValidationRequest.fromFields);

    const eventValidationRequests = (
      await this.capsuleDataProvider.readCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot)
    ).map(EventValidationRequest.fromFields);

    const noteService = new NoteService(this.noteDataProvider, this.aztecNode, this.anchorBlockDataProvider);
    const noteDeliveries = noteValidationRequests.map(request =>
      noteService.deliverNote(
        request.contractAddress,
        request.owner,
        request.storageSlot,
        request.randomness,
        request.noteNonce,
        request.content,
        request.noteHash,
        request.nullifier,
        request.txHash,
        request.recipient,
      ),
    );

    const eventService = new EventService(this.anchorBlockDataProvider, this.aztecNode, this.privateEventDataProvider);
    const eventDeliveries = eventValidationRequests.map(request =>
      eventService.deliverEvent(
        request.contractAddress,
        request.eventTypeId,
        request.serializedEvent,
        request.eventCommitment,
        request.txHash,
        request.recipient,
      ),
    );

    await Promise.all([...noteDeliveries, ...eventDeliveries]);

    // Requests are cleared once we're done.
    await this.capsuleDataProvider.setCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, []);
    await this.capsuleDataProvider.setCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, []);
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

    // We read all log retrieval requests and process them all concurrently. This makes the process much faster as we
    // don't need to wait for the network round-trip.
    const logRetrievalRequests = (
      await this.capsuleDataProvider.readCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot)
    ).map(LogRetrievalRequest.fromFields);

    const logService = new LogService(
      this.aztecNode,
      this.anchorBlockDataProvider,
      this.keyStore,
      this.capsuleDataProvider,
      this.recipientTaggingDataProvider,
      this.addressDataProvider,
    );

    const maybeLogRetrievalResponses = await logService.bulkRetrieveLogs(logRetrievalRequests);

    // Requests are cleared once we're done.
    await this.capsuleDataProvider.setCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot, []);

    // The responses are stored as Option<LogRetrievalResponse> in a second CapsuleArray.
    await this.capsuleDataProvider.setCapsuleArray(
      contractAddress,
      logRetrievalResponsesArrayBaseSlot,
      maybeLogRetrievalResponses.map(LogRetrievalResponse.toSerializedOption),
    );
  }

  public utilityStoreCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.capsuleDataProvider.storeCapsule(this.contractAddress, slot, capsule);
  }

  public async utilityLoadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return (
      // TODO(#12425): On the following line, the pertinent capsule gets overshadowed by the transient one. Tackle this.
      this.capsules.find(c => c.contractAddress.equals(contractAddress) && c.storageSlot.equals(slot))?.data ??
      (await this.capsuleDataProvider.loadCapsule(this.contractAddress, slot))
    );
  }

  public utilityDeleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.capsuleDataProvider.deleteCapsule(this.contractAddress, slot);
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
    return this.capsuleDataProvider.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries);
  }

  // TODO(#11849): consider replacing this oracle with a pure Noir implementation of aes decryption.
  public utilityAes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  public utilityGetSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    return this.getSharedSecret(address, ephPk);
  }

  protected async getSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    // TODO(#12656): return an app-siloed secret
    const recipientCompleteAddress = await this.getCompleteAddress(address);
    const ivskM = await this.keyStore.getMasterSecretKey(
      recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey,
    );
    const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
    return deriveEcdhSharedSecret(addressSecret, ephPk);
  }
}
