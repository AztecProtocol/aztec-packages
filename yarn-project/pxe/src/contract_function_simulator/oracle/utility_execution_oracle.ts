import type { ARCHIVE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Aes128 } from '@aztec/foundation/crypto/aes128';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { LogLevels, type Logger, createLogger } from '@aztec/foundation/log';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import { isProtocolContract } from '@aztec/protocol-contracts';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance, PartialAddress } from '@aztec/stdlib/contract';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { type PublicKeys, computeAddressSecret } from '@aztec/stdlib/keys';
import { deriveEcdhSharedSecret } from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import type { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, Capsule, OffchainEffect } from '@aztec/stdlib/tx';

import type { AccessScopes } from '../../access_scopes.js';
import { createContractLogger, logContractMessage } from '../../contract_logging.js';
import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { EventService } from '../../events/event_service.js';
import { LogService } from '../../logs/log_service.js';
import { MessageContextService } from '../../messages/message_context_service.js';
import { NoteService } from '../../notes/note_service.js';
import { ORACLE_VERSION } from '../../oracle_version.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import { MessageTxContext } from '../noir-structs/message_tx_context.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import { UtilityContext } from '../noir-structs/utility_context.js';
import { pickNotes } from '../pick_notes.js';
import type { IMiscOracle, IUtilityExecutionOracle, NoteData } from './interfaces.js';
import { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

/** Args for UtilityExecutionOracle constructor. */
export type UtilityExecutionOracleArgs = {
  contractAddress: AztecAddress;
  /** List of transient auth witnesses to be used during this simulation */
  authWitnesses: AuthWitness[];
  capsules: Capsule[]; // TODO(#12425): Rename to transientCapsules
  anchorBlockHeader: BlockHeader;
  contractStore: ContractStore;
  noteStore: NoteStore;
  keyStore: KeyStore;
  addressStore: AddressStore;
  aztecNode: AztecNode;
  recipientTaggingStore: RecipientTaggingStore;
  senderAddressBookStore: SenderAddressBookStore;
  capsuleStore: CapsuleStore;
  privateEventStore: PrivateEventStore;
  messageContextService: MessageContextService;
  contractSyncService: ContractSyncService;
  jobId: string;
  log?: ReturnType<typeof createLogger>;
  scopes: AccessScopes;
};

/**
 * The oracle for an execution of utility contract functions.
 */
export class UtilityExecutionOracle implements IMiscOracle, IUtilityExecutionOracle {
  isMisc = true as const;
  isUtility = true as const;

  private contractLogger: Logger | undefined;
  private offchainEffects: OffchainEffect[] = [];

  protected readonly contractAddress: AztecAddress;
  protected readonly authWitnesses: AuthWitness[];
  protected readonly capsules: Capsule[];
  protected readonly anchorBlockHeader: BlockHeader;
  protected readonly contractStore: ContractStore;
  protected readonly noteStore: NoteStore;
  protected readonly keyStore: KeyStore;
  protected readonly addressStore: AddressStore;
  protected readonly aztecNode: AztecNode;
  protected readonly recipientTaggingStore: RecipientTaggingStore;
  protected readonly senderAddressBookStore: SenderAddressBookStore;
  protected readonly capsuleStore: CapsuleStore;
  protected readonly privateEventStore: PrivateEventStore;
  protected readonly messageContextService: MessageContextService;
  protected readonly contractSyncService: ContractSyncService;
  protected readonly jobId: string;
  protected logger: ReturnType<typeof createLogger>;
  protected readonly scopes: AccessScopes;

  constructor(args: UtilityExecutionOracleArgs) {
    this.contractAddress = args.contractAddress;
    this.authWitnesses = args.authWitnesses;
    this.capsules = args.capsules;
    this.anchorBlockHeader = args.anchorBlockHeader;
    this.contractStore = args.contractStore;
    this.noteStore = args.noteStore;
    this.keyStore = args.keyStore;
    this.addressStore = args.addressStore;
    this.aztecNode = args.aztecNode;
    this.recipientTaggingStore = args.recipientTaggingStore;
    this.senderAddressBookStore = args.senderAddressBookStore;
    this.capsuleStore = args.capsuleStore;
    this.privateEventStore = args.privateEventStore;
    this.messageContextService = args.messageContextService;
    this.contractSyncService = args.contractSyncService;
    this.jobId = args.jobId;
    this.logger = args.log ?? createLogger('simulator:client_view_context');
    this.scopes = args.scopes;
  }

  public assertCompatibleOracleVersion(version: number): void {
    // TODO(F-416): Remove this hack on v5 when protocol contracts are redeployed.
    // Protocol contracts/canonical contracts shipped with committed bytecode that cannot be changed. Assert they use
    // the expected pinned version or the current one. We want to allow for both the pinned and the current versions
    // because we want this code to work with both the pinned and unpinned version since some branches do not have the
    // pinned contracts (like e.g. next)
    const LEGACY_ORACLE_VERSION = 12;
    if (isProtocolContract(this.contractAddress)) {
      if (version !== LEGACY_ORACLE_VERSION && version !== ORACLE_VERSION) {
        throw new Error(
          `Expected legacy oracle version ${LEGACY_ORACLE_VERSION} or current oracle version ${ORACLE_VERSION} for alpha payload contract at ${this.contractAddress}, got ${version}.`,
        );
      }
      return;
    }

    if (version !== ORACLE_VERSION) {
      throw new Error(`Incompatible oracle version. Expected version ${ORACLE_VERSION}, got ${version}.`);
    }
  }

  public getRandomField(): Fr {
    return Fr.random();
  }

  public getUtilityContext(): UtilityContext {
    return new UtilityContext(this.anchorBlockHeader, this.contractAddress);
  }

  /**
   * Retrieve keys associated with a specific master public key and app address.
   * @param pkMHash - The master public key hash.
   * @returns A Promise that resolves to nullifier keys.
   * @throws If the keys are not registered in the key store.
   * @throws If scopes are defined and the account is not in the scopes.
   */
  public async getKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    // If scopes are defined, check that the key belongs to an account in the scopes.
    if (this.scopes !== 'ALL_SCOPES' && this.scopes.length > 0) {
      let hasAccess = false;
      for (let i = 0; i < this.scopes.length && !hasAccess; i++) {
        if (await this.keyStore.accountHasKey(this.scopes[i], pkMHash)) {
          hasAccess = true;
        }
      }
      if (!hasAccess) {
        throw new Error(`Key validation request denied: no scoped account has a key with hash ${pkMHash.toString()}.`);
      }
    }
    return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  /**
   * Fetches the index and sibling path of a leaf at a given block from the note hash tree.
   * @param anchorBlockHash - The hash of a block that contains the note hash tree root in which to find the membership
   * witness.
   * @param noteHash - The note hash to find in the note hash tree.
   * @returns The membership witness containing the leaf index and sibling path
   */
  public getNoteHashMembershipWitness(
    anchorBlockHash: BlockHash,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    return this.aztecNode.getNoteHashMembershipWitness(anchorBlockHash, noteHash);
  }

  /**
   * Fetches the index and sibling path of a block hash in the archive tree.
   *
   * Block hashes are the leaves of the archive tree. Each time a new block is added to the chain,
   * its block hash is appended as a new leaf to the archive tree.
   *
   * @param anchorBlockHash - The hash of a block that contains the archive tree root in which to find the membership
   * witness.
   * @param blockHash - The block hash to find in the archive tree.
   * @returns The membership witness containing the leaf index and sibling path
   */
  public getBlockHashMembershipWitness(
    anchorBlockHash: BlockHash,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    return this.aztecNode.getBlockHashMembershipWitness(anchorBlockHash, blockHash);
  }

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  public getNullifierMembershipWitness(
    blockHash: BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.aztecNode.getNullifierMembershipWitness(blockHash, nullifier);
  }

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  public getLowNullifierMembershipWitness(
    blockHash: BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.aztecNode.getLowNullifierMembershipWitness(blockHash, nullifier);
  }

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param leafSlot - The slot of the public data tree to get the witness for.
   * @returns - The witness
   */
  public getPublicDataWitness(blockHash: BlockHash, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return this.aztecNode.getPublicDataWitness(blockHash, leafSlot);
  }

  /**
   * Fetches a block header of a given block.
   * @param blockNumber - The number of a block of which to get the block header.
   * @returns Block extracted from a block with block number `blockNumber`.
   */
  public async getBlockHeader(blockNumber: BlockNumber): Promise<BlockHeader | undefined> {
    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();
    if (blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }

    const block = await this.aztecNode.getBlock(blockNumber);
    return block?.header;
  }

  /**
   * Retrieve the public keys and partial address associated to a given address.
   * @param account - The account address.
   * @returns The public keys and partial address, or `undefined` if the account is not registered.
   */
  public async tryGetPublicKeysAndPartialAddress(
    account: AztecAddress,
  ): Promise<{ publicKeys: PublicKeys; partialAddress: PartialAddress } | undefined> {
    const completeAddress = await this.addressStore.getCompleteAddress(account);
    if (!completeAddress) {
      return undefined;
    }
    return { publicKeys: completeAddress.publicKeys, partialAddress: completeAddress.partialAddress };
  }

  protected async getCompleteAddressOrFail(account: AztecAddress): Promise<CompleteAddress> {
    const completeAddress = await this.addressStore.getCompleteAddress(account);
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
  public async getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    const instance = await this.contractStore.getContractInstance(address);
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
  public getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
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
  public async getNotes(
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
    const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.jobId);

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
  public async checkNullifierExists(innerNullifier: Fr) {
    const [nullifier, anchorBlockHash] = await Promise.all([
      siloNullifier(this.contractAddress, innerNullifier!),
      this.anchorBlockHeader.hash(),
    ]);
    const [leafIndex] = await this.aztecNode.findLeavesIndexes(anchorBlockHash, MerkleTreeId.NULLIFIER_TREE, [
      nullifier,
    ]);
    return leafIndex?.data !== undefined;
  }

  /**
   * Fetches a message from the executionStore, given its key.
   * @param contractAddress - Address of a contract by which the message was emitted.
   * @param messageHash - Hash of the message.
   * @param secret - Secret used to compute a nullifier.
   * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  public async getL1ToL2MembershipWitness(contractAddress: AztecAddress, messageHash: Fr, secret: Fr) {
    const [messageIndex, siblingPath] = await getNonNullifiedL1ToL2MessageWitness(
      this.aztecNode,
      contractAddress,
      messageHash,
      secret,
    );

    return new MessageLoadOracleInputs(messageIndex, siblingPath);
  }

  /**
   * Read the public storage data.
   * @param blockHash - The block hash to read storage at.
   * @param contractAddress - The address to read storage from.
   * @param startStorageSlot - The starting storage slot.
   * @param numberOfElements - Number of elements to read from the starting storage slot.
   */
  public async storageRead(
    blockHash: BlockHash,
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    numberOfElements: number,
  ) {
    const slots = Array(numberOfElements)
      .fill(0)
      .map((_, i) => new Fr(startStorageSlot.value + BigInt(i)));

    const values = await Promise.all(
      slots.map(storageSlot => this.aztecNode.getPublicStorageAt(blockHash, contractAddress, storageSlot)),
    );

    this.logger.debug(
      `Oracle storage read: slots=[${slots.map(slot => slot.toString()).join(', ')}] address=${contractAddress.toString()} values=[${values.join(', ')}]`,
    );

    return values;
  }

  /**
   * Returns a per-contract logger whose output is prefixed with `contract_log::<name>(<addrAbbrev>)`.
   */
  async #getContractLogger(): Promise<Logger> {
    if (!this.contractLogger) {
      // Purpose of instanceId is to distinguish logs from different instances of the same component. It makes sense
      // to re-use jobId as instanceId here as executions of different PXE jobs are isolated.
      this.contractLogger = await createContractLogger(
        this.contractAddress,
        addr => this.contractStore.getDebugContractName(addr),
        { instanceId: this.jobId },
      );
    }
    return this.contractLogger;
  }

  public async log(level: number, message: string, fields: Fr[]): Promise<void> {
    if (!LogLevels[level]) {
      throw new Error(`Invalid log level: ${level}`);
    }
    const logger = await this.#getContractLogger();
    logContractMessage(logger, LogLevels[level], message, fields);
  }

  public async fetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    const logService = new LogService(
      this.aztecNode,
      this.anchorBlockHeader,
      this.keyStore,
      this.capsuleStore,
      this.recipientTaggingStore,
      this.senderAddressBookStore,
      this.addressStore,
      this.jobId,
      this.logger.getBindings(),
    );

    await logService.fetchTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot, this.scopes);
  }

  /**
   * Validates all note and event validation requests enqueued via `enqueue_note_for_validation` and
   * `enqueue_event_for_validation`, inserting them into the note database and event store respectively, making them
   * queryable via `get_notes` and `getPrivateEvents`.
   *
   * This automatically clears both validation request queues, so no further work needs to be done by the caller.
   * @param contractAddress - The address of the contract that the logs are tagged for.
   * @param noteValidationRequestsArrayBaseSlot - The base slot of capsule array containing note validation requests.
   * @param eventValidationRequestsArrayBaseSlot - The base slot of capsule array containing event validation requests.
   */
  public async validateAndStoreEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
    maxNotePackedLen: number,
    maxEventSerializedLen: number,
  ) {
    // TODO(#10727): allow other contracts to store notes
    if (!this.contractAddress.equals(contractAddress)) {
      throw new Error(`Got a note validation request from ${contractAddress}, expected ${this.contractAddress}`);
    }

    // We read all note and event validation requests and process them all concurrently. This makes the process much
    // faster as we don't need to wait for the network round-trip.
    const noteValidationRequests = (
      await this.capsuleStore.readCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, this.jobId)
    ).map(fields => NoteValidationRequest.fromFields(fields, maxNotePackedLen));

    const eventValidationRequests = (
      await this.capsuleStore.readCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, this.jobId)
    ).map(fields => EventValidationRequest.fromFields(fields, maxEventSerializedLen));

    const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.jobId);
    const noteStorePromises = noteValidationRequests.map(request =>
      noteService.validateAndStoreNote(
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

    const eventService = new EventService(this.anchorBlockHeader, this.aztecNode, this.privateEventStore, this.jobId);
    const eventStorePromises = eventValidationRequests.map(request =>
      eventService.validateAndStoreEvent(
        request.contractAddress,
        request.eventTypeId,
        request.randomness,
        request.serializedEvent,
        request.eventCommitment,
        request.txHash,
        request.recipient,
      ),
    );

    await Promise.all([...noteStorePromises, ...eventStorePromises]);

    // Requests are cleared once we're done.
    await this.capsuleStore.setCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, [], this.jobId);
    await this.capsuleStore.setCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, [], this.jobId);
  }

  public async bulkRetrieveLogs(
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
      await this.capsuleStore.readCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot, this.jobId)
    ).map(LogRetrievalRequest.fromFields);

    const logService = new LogService(
      this.aztecNode,
      this.anchorBlockHeader,
      this.keyStore,
      this.capsuleStore,
      this.recipientTaggingStore,
      this.senderAddressBookStore,
      this.addressStore,
      this.jobId,
      this.logger.getBindings(),
    );

    const maybeLogRetrievalResponses = await logService.bulkRetrieveLogs(logRetrievalRequests);

    // Requests are cleared once we're done.
    await this.capsuleStore.setCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot, [], this.jobId);

    // The responses are stored as Option<LogRetrievalResponse> in a second CapsuleArray.
    await this.capsuleStore.setCapsuleArray(
      contractAddress,
      logRetrievalResponsesArrayBaseSlot,
      maybeLogRetrievalResponses.map(LogRetrievalResponse.toSerializedOption),
      this.jobId,
    );
  }

  public async utilityResolveMessageContexts(
    contractAddress: AztecAddress,
    messageContextRequestsArrayBaseSlot: Fr,
    messageContextResponsesArrayBaseSlot: Fr,
  ) {
    try {
      if (!this.contractAddress.equals(contractAddress)) {
        throw new Error(`Got a message context request from ${contractAddress}, expected ${this.contractAddress}`);
      }
      const requestCapsules = await this.capsuleStore.readCapsuleArray(
        contractAddress,
        messageContextRequestsArrayBaseSlot,
        this.jobId,
      );

      const txHashes = requestCapsules.map((fields, i) => {
        if (fields.length !== 1) {
          throw new Error(
            `Malformed message context request at index ${i}: expected 1 field (tx hash), got ${fields.length}`,
          );
        }
        return fields[0];
      });

      const maybeMessageContexts = await this.messageContextService.resolveMessageContexts(
        txHashes,
        this.anchorBlockHeader.getBlockNumber(),
      );

      // Leave response in response capsule array.
      await this.capsuleStore.setCapsuleArray(
        contractAddress,
        messageContextResponsesArrayBaseSlot,
        maybeMessageContexts.map(MessageTxContext.toSerializedOption),
        this.jobId,
      );
    } finally {
      await this.capsuleStore.setCapsuleArray(contractAddress, messageContextRequestsArrayBaseSlot, [], this.jobId);
    }
  }

  public storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    this.capsuleStore.storeCapsule(this.contractAddress, slot, capsule, this.jobId);
    return Promise.resolve();
  }

  public async loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return (
      // TODO(#12425): On the following line, the pertinent capsule gets overshadowed by the transient one. Tackle this.
      this.capsules.find(c => c.contractAddress.equals(contractAddress) && c.storageSlot.equals(slot))?.data ??
      (await this.capsuleStore.loadCapsule(this.contractAddress, slot, this.jobId))
    );
  }

  public deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    this.capsuleStore.deleteCapsule(this.contractAddress, slot, this.jobId);
    return Promise.resolve();
  }

  public copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.capsuleStore.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries, this.jobId);
  }

  /**
   * Clears cached sync state for a contract for a set of scopes, forcing re-sync on the next query so that newly
   * stored notes or events are discovered.
   */
  public invalidateContractSyncCache(contractAddress: AztecAddress, scopes: AztecAddress[]): void {
    if (!contractAddress.equals(this.contractAddress)) {
      throw new Error(`Contract ${this.contractAddress} cannot invalidate sync cache of ${contractAddress}`);
    }
    this.contractSyncService.invalidateContractForScopes(contractAddress, scopes);
  }

  // TODO(#11849): consider replacing this oracle with a pure Noir implementation of aes decryption.
  public aes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  /**
   * Retrieves the shared secret for a given address and ephemeral public key.
   * @param address - The address to get the secret for.
   * @param ephPk - The ephemeral public key to get the secret for.
   * @returns The secret for the given address.
   */
  public async getSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    // TODO(#12656): return an app-siloed secret
    const recipientCompleteAddress = await this.getCompleteAddressOrFail(address);
    const ivskM = await this.keyStore.getMasterSecretKey(
      recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey,
    );
    const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
    return deriveEcdhSharedSecret(addressSecret, ephPk);
  }

  public emitOffchainEffect(data: Fr[]): Promise<void> {
    this.offchainEffects.push({ data, contractAddress: this.contractAddress });
    return Promise.resolve();
  }

  /** Returns offchain effects collected during execution. */
  public getOffchainEffects(): OffchainEffect[] {
    return this.offchainEffects;
  }
}
