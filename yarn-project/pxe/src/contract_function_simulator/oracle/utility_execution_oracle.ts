import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Aes128 } from '@aztec/foundation/crypto/aes128';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { LogLevels, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockParameter, L2Block } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import { siloNullifier, siloPrivateLog } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { computeAddressSecret } from '@aztec/stdlib/keys';
import {
  DirectionalAppTaggingSecret,
  PendingTaggedLog,
  TxScopedL2Log,
  deriveEcdhSharedSecret,
} from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import type { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, Capsule } from '@aztec/stdlib/tx';

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
import { SiloedTag, Tag, WINDOW_HALF_SIZE, getInitialIndexesMap, getPreTagsForTheWindow } from '../../tagging/index.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import { UtilityContext } from '../noir-structs/utility_context.js';
import { pickNotes } from '../pick_notes.js';
import {
  assertCompatibleOracleVersion,
  getNullifierIndex,
  getPrivateLogByTag,
  getPublicLogByTag,
  syncNoteNullifiers,
  validateEnqueuedNotesAndEvents,
} from './common.js';
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
    assertCompatibleOracleVersion(version);
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
    return this.getMembershipWitness(blockNumber, treeId, leafValue);
  }

  protected async getMembershipWitness(
    blockNumber: BlockParameter,
    treeId: MerkleTreeId,
    leafValue: Fr,
  ): Promise<Fr[]> {
    const witness = await this.tryGetMembershipWitness(blockNumber, treeId, leafValue);
    if (!witness) {
      throw new Error(`Leaf value ${leafValue} not found in tree ${MerkleTreeId[treeId]} at block ${blockNumber}`);
    }
    return witness;
  }

  protected async tryGetMembershipWitness(
    blockNumber: BlockParameter,
    treeId: MerkleTreeId,
    value: Fr,
  ): Promise<Fr[] | undefined> {
    switch (treeId) {
      case MerkleTreeId.NULLIFIER_TREE:
        return (await this.aztecNode.getNullifierMembershipWitness(blockNumber, value))?.withoutPreimage().toFields();
      case MerkleTreeId.NOTE_HASH_TREE:
        return (await this.aztecNode.getNoteHashMembershipWitness(blockNumber, value))?.toFields();
      case MerkleTreeId.PUBLIC_DATA_TREE:
        return (await this.aztecNode.getPublicDataWitness(blockNumber, value))?.withoutPreimage().toFields();
      case MerkleTreeId.ARCHIVE:
        return (await this.aztecNode.getArchiveMembershipWitness(blockNumber, value))?.toFields();
      default:
        throw new Error('Not implemented');
    }
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
    return await this.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  protected async getLowNullifierMembershipWitness(
    blockNumber: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
    if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }
    return this.aztecNode.getLowNullifierMembershipWitness(blockNumber, nullifier);
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
    return await this.getPublicDataWitness(blockNumber, leafSlot);
  }

  protected async getPublicDataWitness(
    blockNumber: BlockParameter,
    leafSlot: Fr,
  ): Promise<PublicDataWitness | undefined> {
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
    if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }
    return await this.aztecNode.getPublicDataWitness(blockNumber, leafSlot);
  }

  /**
   * Fetches a block header of a given block.
   * @param blockNumber - The number of a block of which to get the block header.
   * @returns Block extracted from a block with block number `blockNumber`.
   */
  public async utilityGetBlockHeader(blockNumber: BlockNumber): Promise<BlockHeader | undefined> {
    const block = await this.getBlock(blockNumber);
    if (!block) {
      return undefined;
    }
    return block.getBlockHeader();
  }

  protected async getBlock(blockNumber: BlockParameter): Promise<L2Block | undefined> {
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
    if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }
    return await this.aztecNode.getBlock(blockNumber);
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
    const dbNotes = await this.getNotes(this.contractAddress, owner, storageSlot, status, this.scopes);
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

  protected async getNotes(
    contractAddress: AztecAddress,
    owner: AztecAddress | undefined,
    storageSlot: Fr,
    status: NoteStatus,
    scopes?: AztecAddress[],
  ) {
    const noteDaos = await this.noteDataProvider.getNotes({
      contractAddress,
      owner,
      storageSlot,
      status,
      scopes,
    });
    return noteDaos.map(
      ({ contractAddress, owner, storageSlot, randomness, noteNonce, note, noteHash, siloedNullifier, index }) => ({
        contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce,
        note,
        noteHash,
        siloedNullifier,
        // PXE can use this index to get full MembershipWitness
        index,
      }),
    );
  }

  /**
   * Check if a nullifier exists in the nullifier tree.
   * @param innerNullifier - The inner nullifier.
   * @returns A boolean indicating whether the nullifier exists in the tree or not.
   */
  public async utilityCheckNullifierExists(innerNullifier: Fr) {
    const nullifier = await siloNullifier(this.contractAddress, innerNullifier!);
    const index = await getNullifierIndex(nullifier, this.aztecNode);
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
    return await this.getL1ToL2MembershipWitness(contractAddress, messageHash, secret);
  }

  protected async getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    const [messageIndex, siblingPath] = await getNonNullifiedL1ToL2MessageWitness(
      this.aztecNode,
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
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = new Fr(startStorageSlot.value + i);
      const value = await this.getPublicStorageAt(blockNumber, contractAddress, storageSlot);

      this.log.debug(
        `Oracle storage read: slot=${storageSlot.toString()} address-${contractAddress.toString()} value=${value}`,
      );
      values.push(value);
    }
    return values;
  }

  protected async getPublicStorageAt(blockNumber: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
    if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }
    return await this.aztecNode.getPublicStorageAt(blockNumber, contract, slot);
  }

  public utilityDebugLog(level: number, message: string, fields: Fr[]): void {
    if (!LogLevels[level]) {
      throw new Error(`Invalid debug log level: ${level}`);
    }
    const levelName = LogLevels[level];
    this.aztecNrDebugLog[levelName](`${applyStringFormatting(message, fields)}`);
  }

  public async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    await this.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot, this.scopes);

    await syncNoteNullifiers(this.contractAddress, this.anchorBlockDataProvider, this.noteDataProvider, this.aztecNode);
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

    await validateEnqueuedNotesAndEvents(
      contractAddress,
      noteValidationRequestsArrayBaseSlot,
      eventValidationRequestsArrayBaseSlot,
      this.capsuleDataProvider,
      this.anchorBlockDataProvider,
      this.aztecNode,
      this.noteDataProvider,
      this.privateEventDataProvider,
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

    await this.bulkRetrieveLogs(contractAddress, logRetrievalRequestsArrayBaseSlot, logRetrievalResponsesArrayBaseSlot);
  }

  protected async bulkRetrieveLogs(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
  ) {
    // We read all log retrieval requests and process them all concurrently. This makes the process much faster as we
    // don't need to wait for the network round-trip.
    const logRetrievalRequests = (
      await this.capsuleDataProvider.readCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot)
    ).map(LogRetrievalRequest.fromFields);

    const maybeLogRetrievalResponses = await Promise.all(
      logRetrievalRequests.map(async request => {
        // TODO(#14555): remove these internal functions and have node endpoints that do this instead
        const [publicLog, privateLog] = await Promise.all([
          getPublicLogByTag(request.unsiloedTag, request.contractAddress, this.aztecNode),
          getPrivateLogByTag(await siloPrivateLog(request.contractAddress, request.unsiloedTag), this.aztecNode),
        ]);

        if (publicLog !== null) {
          if (privateLog !== null) {
            throw new Error(
              `Found both a public and private log when searching for tag ${request.unsiloedTag} from contract ${request.contractAddress}`,
            );
          }

          return new LogRetrievalResponse(
            publicLog.logPayload,
            publicLog.txHash,
            publicLog.uniqueNoteHashesInTx,
            publicLog.firstNullifierInTx,
          );
        } else if (privateLog !== null) {
          return new LogRetrievalResponse(
            privateLog.logPayload,
            privateLog.txHash,
            privateLog.uniqueNoteHashesInTx,
            privateLog.firstNullifierInTx,
          );
        } else {
          return null;
        }
      }),
    );

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

  // TODO(#17775): Replace this implementation of this function with one implementing an approach similar
  // to syncSenderTaggingIndexes. Not done yet due to re-prioritization to devex and this doesn't directly affect
  // devex.
  protected async syncTaggedLogs(
    contractAddress: AztecAddress,
    pendingTaggedLogArrayBaseSlot: Fr,
    scopes?: AztecAddress[],
  ) {
    const maxBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

    // Ideally this algorithm would be implemented in noir, exposing its building blocks as oracles.
    // However it is impossible at the moment due to the language not supporting nested slices.
    // This nesting is necessary because for a given set of tags we don't
    // know how many logs we will get back. Furthermore, these logs are of undetermined
    // length, since we don't really know the note they correspond to until we decrypt them.
    const recipients = scopes ? scopes : await this.keyStore.getAccounts();
    for (const recipient of recipients) {
      // Get all the secrets for the recipient and sender pairs (#9365)
      const indexedSecrets = await this.getLastUsedTaggingIndexesForSenders(contractAddress, recipient);

      // We fetch logs for a window of indexes in a range:
      //    <latest_log_index - WINDOW_HALF_SIZE, latest_log_index + WINDOW_HALF_SIZE>.
      //
      // We use this window approach because it could happen that a sender might have messed up and inadvertently
      // incremented their index without us getting any logs (for example, in case of a revert). If we stopped looking
      // for logs the first time we don't receive any logs for a tag, we might never receive anything from that sender again.
      //    Also there's a possibility that we have advanced our index, but the sender has reused it, so we might have missed
      // some logs. For these reasons, we have to look both back and ahead of the stored index.
      let secretsAndWindows = indexedSecrets.map(indexedSecret => {
        if (indexedSecret.index === undefined) {
          return {
            secret: indexedSecret.secret,
            leftMostIndex: 0,
            rightMostIndex: WINDOW_HALF_SIZE,
          };
        } else {
          return {
            secret: indexedSecret.secret,
            leftMostIndex: Math.max(0, indexedSecret.index - WINDOW_HALF_SIZE),
            rightMostIndex: indexedSecret.index + WINDOW_HALF_SIZE,
          };
        }
      });

      // As we iterate we store the largest index we have seen for a given secret to later on store it in the db.
      const newLargestIndexMapToStore: { [k: string]: number } = {};

      // The initial/unmodified indexes of the secrets stored in a key-value map where key is the directional app
      // tagging secret.
      const initialIndexesMap = getInitialIndexesMap(indexedSecrets);

      while (secretsAndWindows.length > 0) {
        const preTagsForTheWholeWindow = getPreTagsForTheWindow(secretsAndWindows);
        const tagsForTheWholeWindow = await Promise.all(
          preTagsForTheWholeWindow.map(async preTag => {
            return SiloedTag.compute(await Tag.compute(preTag), contractAddress);
          }),
        );

        // We store the new largest indexes we find in the iteration in the following map to later on construct
        // a new set of secrets and windows to fetch logs for.
        const newLargestIndexMapForIteration: { [k: string]: number } = {};

        // Fetch the private logs for the tags and iterate over them
        // TODO: The following conversion is unfortunate and we should most likely just type the #getPrivateLogsByTags
        // to accept SiloedTag[] instead of Fr[]. That would result in a large change so I didn't do it yet.
        const tagsForTheWholeWindowAsFr = tagsForTheWholeWindow.map(tag => tag.value);
        const logsByTags = await this.internalGetPrivateLogsByTags(tagsForTheWholeWindowAsFr);

        for (let logIndex = 0; logIndex < logsByTags.length; logIndex++) {
          const logsByTag = logsByTags[logIndex];
          if (logsByTag.length > 0) {
            // We filter out the logs that are newer than the anchor block number of the tx currently being constructed
            const filteredLogsByBlockNumber = logsByTag.filter(l => l.blockNumber <= maxBlockNumber);

            // We store the logs in capsules (to later be obtained in Noir)
            await this.storePendingTaggedLogs(
              contractAddress,
              pendingTaggedLogArrayBaseSlot,
              recipient,
              filteredLogsByBlockNumber,
            );

            // We retrieve the pre-tag corresponding to the log as I need that to evaluate whether
            // a new largest index have been found.
            const preTagCorrespondingToLog = preTagsForTheWholeWindow[logIndex];
            const initialIndex = initialIndexesMap[preTagCorrespondingToLog.secret.toString()];

            if (
              preTagCorrespondingToLog.index >= initialIndex &&
              (newLargestIndexMapForIteration[preTagCorrespondingToLog.secret.toString()] === undefined ||
                preTagCorrespondingToLog.index >=
                  newLargestIndexMapForIteration[preTagCorrespondingToLog.secret.toString()])
            ) {
              // We have found a new largest index so we store it for later processing (storing it in the db + fetching
              // the difference of the window sets of current and the next iteration)
              newLargestIndexMapForIteration[preTagCorrespondingToLog.secret.toString()] =
                preTagCorrespondingToLog.index + 1;
            }
          }
        }

        // Now based on the new largest indexes we found, we will construct a new secrets and windows set to fetch logs
        // for. Note that it's very unlikely that a new log from the current window would appear between the iterations
        // so we fetch the logs only for the difference of the window sets.
        const newSecretsAndWindows = [];
        for (const [directionalAppTaggingSecret, newIndex] of Object.entries(newLargestIndexMapForIteration)) {
          const maybeIndexedSecret = indexedSecrets.find(
            indexedSecret => indexedSecret.secret.toString() === directionalAppTaggingSecret,
          );
          if (maybeIndexedSecret) {
            newSecretsAndWindows.push({
              secret: maybeIndexedSecret.secret,
              // We set the left most index to the new index to avoid fetching the same logs again
              leftMostIndex: newIndex,
              rightMostIndex: newIndex + WINDOW_HALF_SIZE,
            });

            // We store the new largest index in the map to later store it in the db.
            newLargestIndexMapToStore[directionalAppTaggingSecret] = newIndex;
          } else {
            throw new Error(
              `Secret not found for directionalAppTaggingSecret ${directionalAppTaggingSecret}. This is a bug as it should never happen!`,
            );
          }
        }

        // Now we set the new secrets and windows and proceed to the next iteration.
        secretsAndWindows = newSecretsAndWindows;
      }

      // At this point we have processed all the logs for the recipient so we store the last used indexes in the db.
      // newLargestIndexMapToStore contains "next" indexes to look for (one past the last found), so subtract 1 to get
      // last used.
      await this.recipientTaggingDataProvider.setLastUsedIndexes(
        Object.entries(newLargestIndexMapToStore).map(([directionalAppTaggingSecret, index]) => ({
          secret: DirectionalAppTaggingSecret.fromString(directionalAppTaggingSecret),
          index: index - 1,
        })),
      );
    }
  }

  protected async storePendingTaggedLogs(
    contractAddress: AztecAddress,
    capsuleArrayBaseSlot: Fr,
    recipient: AztecAddress,
    privateLogs: TxScopedL2Log[],
  ) {
    // Build all pending tagged logs upfront with their tx effects
    const pendingTaggedLogs = await Promise.all(
      privateLogs.map(async scopedLog => {
        // TODO(#9789): get these effects along with the log
        const txEffect = await this.aztecNode.getTxEffect(scopedLog.txHash);
        if (!txEffect) {
          throw new Error(`Could not find tx effect for tx hash ${scopedLog.txHash}`);
        }

        const pendingTaggedLog = new PendingTaggedLog(
          scopedLog.log.fields,
          scopedLog.txHash,
          txEffect.data.noteHashes,
          txEffect.data.nullifiers[0],
          recipient,
        );

        return pendingTaggedLog.toFields();
      }),
    );

    return this.capsuleDataProvider.appendToCapsuleArray(contractAddress, capsuleArrayBaseSlot, pendingTaggedLogs);
  }

  /**
   * Returns the last used tagging indexes along with the directional app tagging secrets for a given recipient and all
   * the senders in the address book.
   * This method should be exposed as an oracle call to allow aztec.nr to perform the orchestration
   * of the syncTaggedLogs and processTaggedLogs methods. However, it is not possible to do so at the moment,
   * so we're keeping it private for now.
   * @param contractAddress - The contract address to silo the secret for
   * @param recipient - The address receiving the notes
   * @returns A list of directional app tagging secrets along with the last used tagging indexes. If the corresponding
   * secret was never used, the index is undefined.
   * TODO(#17775): The naming here is broken as the function name does not reflect the return type. Make sure this gets
   * fixed when implementing the linked issue.
   */
  protected async getLastUsedTaggingIndexesForSenders(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
  ): Promise<{ secret: DirectionalAppTaggingSecret; index: number | undefined }[]> {
    const recipientCompleteAddress = await this.getCompleteAddress(recipient);
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);

    // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
    // (recipient = us, sender = us)
    const senders = [
      ...(await this.recipientTaggingDataProvider.getSenderAddresses()),
      ...(await this.keyStore.getAccounts()),
    ].filter((address, index, self) => index === self.findIndex(otherAddress => otherAddress.equals(address)));
    const secrets = await Promise.all(
      senders.map(contact => {
        return DirectionalAppTaggingSecret.compute(
          recipientCompleteAddress,
          recipientIvsk,
          contact,
          contractAddress,
          recipient,
        );
      }),
    );
    const indexes = await this.recipientTaggingDataProvider.getLastUsedIndexes(secrets);
    if (indexes.length !== secrets.length) {
      throw new Error('Indexes and directional app tagging secrets have different lengths');
    }

    return secrets.map((secret, i) => ({
      secret,
      index: indexes[i],
    }));
  }

  // TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
  // was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
  protected async internalGetPrivateLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    const allLogs = await this.aztecNode.getLogsByTags(tags);
    return allLogs.map(logs => logs.filter(log => !log.isFromPublic));
  }
}
