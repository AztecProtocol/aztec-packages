import type { ARCHIVE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { uniqueBy } from '@aztec/foundation/collection';
import { Aes128 } from '@aztec/foundation/crypto/aes128';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { LogLevels, type Logger, createLogger } from '@aztec/foundation/log';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import { isProtocolContract } from '@aztec/protocol-contracts';
import {
  type CircuitSimulator,
  ExecutionError,
  extractCallStack,
  resolveAssertionMessageFromError,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator/client';
import { type FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type L2TipsProvider } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance, PartialAddress } from '@aztec/stdlib/contract';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { type PublicKeys, computeAddressSecret } from '@aztec/stdlib/keys';
import { MessageContext, deriveAppSiloedSharedSecret } from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import type { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, Capsule, IndexedTxEffect, OffchainEffect, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { createContractLogger, logContractMessage, stripAztecnrLogPrefix } from '../../contract_logging.js';
import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { EventService } from '../../events/event_service.js';
import type { ExecutionHooks } from '../../hooks/index.js';
import { LogService } from '../../logs/log_service.js';
import { MessageContextService } from '../../messages/message_context_service.js';
import { NoteService } from '../../notes/note_service.js';
import { ORACLE_VERSION_MAJOR } from '../../oracle_version.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import type { CapsuleService } from '../../storage/capsule_store/capsule_service.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { FactService } from '../../storage/fact_store/fact_service.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import { UtilityContext } from '../noir-structs/utility_context.js';
import { pickNotes } from '../pick_notes.js';
import type { IMiscOracle, IUtilityExecutionOracle, NoteData } from './interfaces.js';
import { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';
import { Oracle } from './oracle.js';

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
  capsuleService: CapsuleService;
  factService: FactService;
  privateEventStore: PrivateEventStore;
  messageContextService: MessageContextService;
  contractSyncService: ContractSyncService;
  l2TipsStore: L2TipsProvider;
  jobId: string;
  log?: ReturnType<typeof createLogger>;
  scopes: AztecAddress[];
  simulator: CircuitSimulator;
  hooks?: ExecutionHooks;
  /** Needed to trigger contract synchronization before nested cross-contract calls. */
  utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<void>;
};

/**
 * The oracle for an execution of utility contract functions.
 */
export class UtilityExecutionOracle implements IMiscOracle, IUtilityExecutionOracle {
  isMisc = true as const;
  isUtility = true as const;

  private contractLogger: Logger | undefined;
  private aztecnrLogger: Logger | undefined;
  private offchainEffects: OffchainEffect[] = [];
  private readonly ephemeralArrayService = new EphemeralArrayService();

  // We store oracle version to be able to show a nice error message when an oracle handler is missing.
  private contractOracleVersion: { major: number; minor: number } | undefined;

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
  protected readonly capsuleService: CapsuleService;
  protected readonly factService: FactService;
  protected readonly privateEventStore: PrivateEventStore;
  protected readonly messageContextService: MessageContextService;
  protected readonly contractSyncService: ContractSyncService;
  protected readonly l2TipsStore: L2TipsProvider;
  protected readonly jobId: string;
  protected logger: ReturnType<typeof createLogger>;
  protected readonly scopes: AztecAddress[];
  protected readonly simulator: CircuitSimulator;
  protected readonly hooks: ExecutionHooks | undefined;
  protected readonly utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<void>;

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
    this.capsuleService = args.capsuleService;
    this.factService = args.factService;
    this.privateEventStore = args.privateEventStore;
    this.messageContextService = args.messageContextService;
    this.contractSyncService = args.contractSyncService;
    this.l2TipsStore = args.l2TipsStore;
    this.jobId = args.jobId;
    this.logger = args.log ?? createLogger('simulator:client_view_context');
    this.scopes = args.scopes;
    this.simulator = args.simulator;
    this.hooks = args.hooks;
    this.utilityExecutor = args.utilityExecutor;
  }

  public assertCompatibleOracleVersion(major: number, minor: number): void {
    // TODO(F-416): Remove this hack on v5 when protocol contracts are redeployed.
    // Protocol contracts/canonical contracts shipped with committed bytecode that cannot be changed. Assert they use
    // the expected pinned version or the current one. We want to allow for both the pinned and the current versions
    // because we want this code to work with both the pinned and unpinned version since some branches do not have the
    // pinned contracts (like e.g. next)
    const LEGACY_ORACLE_VERSION = 12;
    if (isProtocolContract(this.contractAddress)) {
      if (major !== LEGACY_ORACLE_VERSION && major !== ORACLE_VERSION_MAJOR) {
        const hint =
          major > ORACLE_VERSION_MAJOR
            ? 'The contract was compiled with a newer version of Aztec.nr than your private environment supports. Upgrade your private environment to a compatible version.'
            : 'The contract was compiled with an older version of Aztec.nr than your private environment supports. Recompile the contract with a compatible version of Aztec.nr.';
        throw new Error(
          `Incompatible private environment version: ${hint} See https://docs.aztec.network/errors/8 (expected oracle major version ${LEGACY_ORACLE_VERSION} or ${ORACLE_VERSION_MAJOR}, got ${major})`,
        );
      }
      this.contractOracleVersion = { major, minor };
      return;
    }

    if (major !== ORACLE_VERSION_MAJOR) {
      const hint =
        major > ORACLE_VERSION_MAJOR
          ? 'The contract was compiled with a newer version of Aztec.nr than your private environment supports. Upgrade your private environment to a compatible version.'
          : 'The contract was compiled with an older version of Aztec.nr than your private environment supports. Recompile the contract with a compatible version of Aztec.nr.';
      throw new Error(
        `Incompatible private environment version: ${hint} See https://docs.aztec.network/errors/8 (expected oracle major version ${ORACLE_VERSION_MAJOR}, got ${major})`,
      );
    }

    // Major matches - store both major and minor for later diagnostics (e.g. when an oracle is not found)
    this.contractOracleVersion = { major, minor };
  }

  // Prefixed with "nonOracleFunction" as it is not used as an oracle handler.
  public nonOracleFunctionGetContractOracleVersion(): { major: number; minor: number } | undefined {
    return this.contractOracleVersion;
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
    let hasAccess = false;
    for (let i = 0; i < this.scopes.length && !hasAccess; i++) {
      if (await this.keyStore.accountHasKey(this.scopes[i], pkMHash)) {
        hasAccess = true;
      }
    }
    if (!hasAccess) {
      throw new Error(`Key validation request denied: no scoped account has a key with hash ${pkMHash.toString()}.`);
    }
    return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  /**
   * Fetches the index and sibling path of a leaf at a given block from the note hash tree.
   * @param blockHash - The hash of a block that contains the note hash tree root in which to find the
   * membership witness.
   * @param noteHash - The note hash to find in the note hash tree.
   * @returns The membership witness containing the leaf index and sibling path
   */
  public getNoteHashMembershipWitness(
    blockHash: BlockHash,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    return this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getNoteHashMembershipWitness(blockHash, noteHash),
    );
  }

  /**
   * Fetches the index and sibling path of a block hash in the archive tree.
   *
   * Block hashes are the leaves of the archive tree. Each time a new block is added to the chain,
   * its block hash is appended as a new leaf to the archive tree.
   *
   * @param referenceBlockHash - The hash of a block that contains the archive tree root in which to find the membership
   * witness.
   * @param blockHash - The block hash to find in the archive tree.
   * @returns The membership witness containing the leaf index and sibling path
   */
  public getBlockHashMembershipWitness(
    referenceBlockHash: BlockHash,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    // Note that we validate that the reference block hash is at or before the anchor block - we don't test the block
    // hash at all. If the block hash did not exist by the reference block hash, then the node will not return the
    // membership witness as there is none.
    return this.#queryWithBlockHashNotAfterAnchor(referenceBlockHash, () =>
      this.aztecNode.getBlockHashMembershipWitness(referenceBlockHash, blockHash),
    );
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
    return this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getNullifierMembershipWitness(blockHash, nullifier),
    );
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
    return this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getLowNullifierMembershipWitness(blockHash, nullifier),
    );
  }

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param leafSlot - The slot of the public data tree to get the witness for.
   * @returns - The witness
   */
  public getPublicDataWitness(blockHash: BlockHash, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getPublicDataWitness(blockHash, leafSlot),
    );
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

    // Most contracts query state at the "current" block, which is the anchor. Skip the RPC when we can.
    if (blockNumber === anchorBlockNumber) {
      return this.anchorBlockHeader;
    }

    const block = await this.aztecNode.getBlock(blockNumber);
    return block?.header;
  }

  /**
   * Retrieve the public keys and partial address associated to a given address.
   * @param account - The account address.
   * @returns The public keys and partial address, or `undefined` if the account is not registered.
   */
  public async getPublicKeysAndPartialAddress(
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
   * Returns an auth witness for the given message hash from the list of transient witnesses for this transaction.
   * @param messageHash - Hash of the message to authenticate.
   * @returns Authentication witness for the requested message hash, or undefined if not found.
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
  public async doesNullifierExist(innerNullifier: Fr) {
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
   * Returns the membership witness of an un-nullified L1 to L2 message.
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
      await this.anchorBlockHeader.hash(),
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
  public getFromPublicStorage(
    blockHash: BlockHash,
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    numberOfElements: number,
  ) {
    return this.#queryWithBlockHashNotAfterAnchor(blockHash, async () => {
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
    });
  }

  /**
   * Returns a per-contract logger whose output is prefixed with `contract:<name>(<addrAbbrev>)`.
   */
  async #getContractLogger(): Promise<Logger> {
    if (!this.contractLogger) {
      // Purpose of instanceId is to distinguish logs from different instances of the same component. It makes sense
      // to re-use jobId as instanceId here as executions of different PXE jobs are isolated.
      this.contractLogger = await createContractLogger(
        this.contractAddress,
        addr => this.contractStore.getDebugContractName(addr),
        'user',
        { instanceId: this.jobId },
      );
    }
    return this.contractLogger;
  }

  /**
   * Returns a per-contract logger whose output is prefixed with `aztecnr:<name>(<addrAbbrev>)`.
   */
  async #getAztecnrLogger(): Promise<Logger> {
    if (!this.aztecnrLogger) {
      // Purpose of instanceId is to distinguish logs from different instances of the same component. It makes sense
      // to re-use jobId as instanceId here as executions of different PXE jobs are isolated.
      this.aztecnrLogger = await createContractLogger(
        this.contractAddress,
        addr => this.contractStore.getDebugContractName(addr),
        'aztecnr',
        { instanceId: this.jobId },
      );
    }
    return this.aztecnrLogger;
  }

  public async log(level: number, message: string, fields: Fr[]): Promise<void> {
    if (!LogLevels[level]) {
      throw new Error(`Invalid log level: ${level}`);
    }

    const { kind, message: strippedMessage } = stripAztecnrLogPrefix(message);

    const logger = kind == 'aztecnr' ? await this.#getAztecnrLogger() : await this.#getContractLogger();
    logContractMessage(logger, LogLevels[level], strippedMessage, fields);
  }

  // Deprecated, only kept for backwards compatibility until Alpha v5 rolls out.
  public async getPendingTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr, scope: AztecAddress) {
    const logService = this.#createLogService();
    const logs = await logService.fetchTaggedLogs(this.contractAddress, scope);
    await this.capsuleService.appendToCapsuleArray(
      this.contractAddress,
      pendingTaggedLogArrayBaseSlot,
      logs.map(log => log.toFields()),
      this.jobId,
      scope,
    );
  }

  /** Fetches pending tagged logs into a freshly allocated ephemeral array and returns its base slot. */
  public async getPendingTaggedLogsV2(scope: AztecAddress): Promise<Fr> {
    const logService = this.#createLogService();
    const logs = await logService.fetchTaggedLogs(this.contractAddress, scope);
    return this.ephemeralArrayService.newArray(logs.map(log => log.toFields()));
  }

  #createLogService(): LogService {
    return new LogService(
      this.aztecNode,
      this.anchorBlockHeader,
      this.l2TipsStore,
      this.keyStore,
      this.recipientTaggingStore,
      this.senderAddressBookStore,
      this.addressStore,
      this.jobId,
      this.logger.getBindings(),
    );
  }

  /**
   * Legacy: validates note/event requests stored in capsule arrays.
   *
   * Deprecated, only kept for backwards compatibility until Alpha v5 rolls out.
   */
  public async validateAndStoreEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
    maxNotePackedLen: number,
    maxEventSerializedLen: number,
    scope: AztecAddress,
  ) {
    // TODO(#10727): allow other contracts to store notes
    if (!this.contractAddress.equals(contractAddress)) {
      throw new Error(`Got a note validation request from ${contractAddress}, expected ${this.contractAddress}`);
    }

    const noteValidationRequests = (
      await this.capsuleService.readCapsuleArray(
        contractAddress,
        noteValidationRequestsArrayBaseSlot,
        this.jobId,
        scope,
      )
    ).map(fields => NoteValidationRequest.fromFields(fields, maxNotePackedLen));

    const eventValidationRequests = (
      await this.capsuleService.readCapsuleArray(
        contractAddress,
        eventValidationRequestsArrayBaseSlot,
        this.jobId,
        scope,
      )
    ).map(fields => EventValidationRequest.fromFields(fields, maxEventSerializedLen));

    await this.#processValidationRequests(noteValidationRequests, eventValidationRequests, scope);

    await this.capsuleService.setCapsuleArray(
      contractAddress,
      noteValidationRequestsArrayBaseSlot,
      [],
      this.jobId,
      scope,
    );
    await this.capsuleService.setCapsuleArray(
      contractAddress,
      eventValidationRequestsArrayBaseSlot,
      [],
      this.jobId,
      scope,
    );
  }

  public async validateAndStoreEnqueuedNotesAndEventsV2(
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
    maxNotePackedLen: number,
    maxEventSerializedLen: number,
    scope: AztecAddress,
  ) {
    const noteValidationRequests = this.ephemeralArrayService
      .readArrayAt(noteValidationRequestsArrayBaseSlot)
      .map(fields => NoteValidationRequest.fromFields(fields, maxNotePackedLen));

    const eventValidationRequests = this.ephemeralArrayService
      .readArrayAt(eventValidationRequestsArrayBaseSlot)
      .map(fields => EventValidationRequest.fromFields(fields, maxEventSerializedLen));

    await this.#processValidationRequests(noteValidationRequests, eventValidationRequests, scope);
  }

  /**
   * Dispatches note and event validation requests to the service layer.
   *
   * This function is an auxiliary to support legacy (capsule backed) and new (ephemeral array backed) versions of the
   * `validateAndStoreEnqueuedNotesAndEvents` oracle.
   */
  async #processValidationRequests(
    noteValidationRequests: NoteValidationRequest[],
    eventValidationRequests: EventValidationRequest[],
    scope: AztecAddress,
  ) {
    const txEffects = await this.#fetchTxEffects([
      ...noteValidationRequests.map(r => r.txHash),
      ...eventValidationRequests.map(r => r.txHash),
    ]);

    const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.jobId);
    const eventService = new EventService(this.anchorBlockHeader, this.aztecNode, this.privateEventStore, this.jobId);

    await Promise.all([
      noteService.validateAndStoreNotes(noteValidationRequests, scope, txEffects),
      eventService.validateAndStoreEvents(eventValidationRequests, scope, txEffects),
    ]);
  }

  public async getLogsByTag(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
    scope: AztecAddress,
  ) {
    // TODO(#10727): allow other contracts to process partial notes
    if (!this.contractAddress.equals(contractAddress)) {
      throw new Error(`Got a note validation request from ${contractAddress}, expected ${this.contractAddress}`);
    }

    // We read all log retrieval requests and process them all concurrently. This makes the process much faster as we
    // don't need to wait for the network round-trip.
    const logRetrievalRequests = (
      await this.capsuleService.readCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot, this.jobId, scope)
    ).map(LogRetrievalRequest.fromFields);

    const logService = this.#createLogService();
    const maybeLogRetrievalResponses = await logService.fetchLogsByTag(contractAddress, logRetrievalRequests);

    // Requests are cleared once we're done.
    await this.capsuleService.setCapsuleArray(
      contractAddress,
      logRetrievalRequestsArrayBaseSlot,
      [],
      this.jobId,
      scope,
    );

    // The responses are stored as Option<LogRetrievalResponse> in a second CapsuleArray.
    await this.capsuleService.setCapsuleArray(
      contractAddress,
      logRetrievalResponsesArrayBaseSlot,
      maybeLogRetrievalResponses.map(LogRetrievalResponse.toSerializedOption),
      this.jobId,
      scope,
    );
  }

  public async getLogsByTagV2(requestArrayBaseSlot: Fr): Promise<Fr> {
    const logRetrievalRequests = this.ephemeralArrayService
      .readArrayAt(requestArrayBaseSlot)
      .map(LogRetrievalRequest.fromFields);
    const logService = this.#createLogService();

    const maybeLogRetrievalResponses = await logService.fetchLogsByTag(this.contractAddress, logRetrievalRequests);

    return this.ephemeralArrayService.newArray(maybeLogRetrievalResponses.map(LogRetrievalResponse.toSerializedOption));
  }

  // Deprecated, only kept for backwards compatibility until Alpha v5 rolls out.
  public async getMessageContextsByTxHash(
    contractAddress: AztecAddress,
    messageContextRequestsArrayBaseSlot: Fr,
    messageContextResponsesArrayBaseSlot: Fr,
    scope: AztecAddress,
  ) {
    try {
      if (!this.contractAddress.equals(contractAddress)) {
        throw new Error(`Got a message context request from ${contractAddress}, expected ${this.contractAddress}`);
      }

      // TODO(@mverzilli): this is a prime example of where using an ephemeral array would make much more sense, we don't
      // need scopes here, we just need a bit of shared memory to cross boundaries between Noir and TS.
      // At the same time, we don't want to allow any global scope access other than where backwards compatibility
      // forces us to. Hence we need the scope here to be artificial.
      const requestCapsules = await this.capsuleService.readCapsuleArray(
        contractAddress,
        messageContextRequestsArrayBaseSlot,
        this.jobId,
        scope,
      );

      const txHashes = requestCapsules.map((fields, i) => {
        if (fields.length !== 1) {
          throw new Error(
            `Malformed message context request at index ${i}: expected 1 field (tx hash), got ${fields.length}`,
          );
        }
        return fields[0];
      });

      const maybeMessageContexts = await this.messageContextService.getMessageContextsByTxHash(
        txHashes,
        this.anchorBlockHeader.getBlockNumber(),
      );

      // Leave response in response capsule array.
      await this.capsuleService.setCapsuleArray(
        contractAddress,
        messageContextResponsesArrayBaseSlot,
        maybeMessageContexts.map(MessageContext.toSerializedOption),
        this.jobId,
        scope,
      );
    } finally {
      await this.capsuleService.setCapsuleArray(
        contractAddress,
        messageContextRequestsArrayBaseSlot,
        [],
        this.jobId,
        scope,
      );
    }
  }

  /** Reads tx hash requests from an ephemeral array, resolves their contexts, and returns the response slot. */
  public async getMessageContextsByTxHashV2(requestArrayBaseSlot: Fr): Promise<Fr> {
    const requestFields = this.ephemeralArrayService.readArrayAt(requestArrayBaseSlot);

    const txHashes = requestFields.map((fields, i) => {
      if (fields.length !== 1) {
        throw new Error(
          `Malformed message context request at index ${i}: expected 1 field (tx hash), got ${fields.length}`,
        );
      }
      return fields[0];
    });

    const maybeMessageContexts = await this.messageContextService.getMessageContextsByTxHash(
      txHashes,
      this.anchorBlockHeader.getBlockNumber(),
    );

    return this.ephemeralArrayService.newArray(maybeMessageContexts.map(MessageContext.toSerializedOption));
  }

  /**
   * Fetches the effects of a transaction by its hash. Returns null if the tx is not found or is beyond the anchor
   * block.
   */
  public async getTxEffect(txHash: TxHash): Promise<TxEffect | null> {
    if (txHash.hash.isZero()) {
      throw new Error('Invalid tx hash passed into aztec_utl_getTxEffect oracle handler');
    }

    const txEffect = await this.aztecNode.getTxEffect(txHash);
    if (!txEffect || txEffect.l2BlockNumber > this.anchorBlockHeader.getBlockNumber()) {
      return null;
    }

    return txEffect.data;
  }

  public setCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], scope: AztecAddress): void {
    this.#assertOwnDb(contractAddress);
    this.capsuleService.setCapsule(contractAddress, slot, capsule, this.jobId, scope);
  }

  public getCapsule(contractAddress: AztecAddress, slot: Fr, scope: AztecAddress): Promise<Fr[] | null> {
    this.#assertOwnDb(contractAddress);
    return this.capsuleService.getCapsule(contractAddress, slot, this.jobId, scope, this.capsules);
  }

  public deleteCapsule(contractAddress: AztecAddress, slot: Fr, scope: AztecAddress): void {
    this.#assertOwnDb(contractAddress);
    this.capsuleService.deleteCapsule(contractAddress, slot, this.jobId, scope);
  }

  public copyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
    scope: AztecAddress,
  ): Promise<void> {
    this.#assertOwnDb(contractAddress);
    return this.capsuleService.copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, this.jobId, scope);
  }

  /**
   * Guards access to this oracle's PXE DB: only the executing contract may read or write its own storage.
   * Shared by the capsule and fact-store handlers.
   */
  #assertOwnDb(contractAddress: AztecAddress): void {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
  }

  public recordFact(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    entityType: Fr,
    factType: Fr,
    correlationKey: Fr,
    payload: Fr[],
    origin: { blockNumber: number; blockHash: Fr } | null,
  ): Promise<void> {
    this.#assertOwnDb(contractAddress);
    return this.factService.recordFact(
      contractAddress,
      scope,
      entityType,
      factType,
      correlationKey.toBuffer(),
      Buffer.concat(payload.map(f => f.toBuffer())),
      origin ? { blockNumber: origin.blockNumber, blockHash: origin.blockHash.toString() } : null,
      this.jobId,
    );
  }

  public async activeEntities(contractAddress: AztecAddress, scope: AztecAddress, entityType: Fr): Promise<Fr[]> {
    this.#assertOwnDb(contractAddress);
    const keys = await this.factService.activeEntities(contractAddress, scope, entityType, this.jobId);
    return keys.map(k => Fr.fromBuffer(k));
  }

  public async loadCanonicalFacts(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    entityType: Fr,
    correlationKey: Fr,
  ): Promise<{ factType: Fr; payload: Fr[] }[]> {
    this.#assertOwnDb(contractAddress);
    const facts = await this.factService.loadCanonicalFactSet(
      contractAddress,
      scope,
      entityType,
      correlationKey.toBuffer(),
      this.jobId,
    );
    return facts.map(f => ({ factType: f.factType, payload: bufferToFields(f.payload) }));
  }

  public terminateEntity(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    entityType: Fr,
    correlationKey: Fr,
  ): Promise<void> {
    this.#assertOwnDb(contractAddress);
    return this.factService.terminateEntity(contractAddress, scope, entityType, correlationKey.toBuffer(), this.jobId);
  }

  /**
   * Clears cached sync state for a contract for a set of scopes, forcing re-sync on the next query so that newly
   * stored notes or events are discovered.
   */
  public setContractSyncCacheInvalid(contractAddress: AztecAddress, scopes: AztecAddress[]): void {
    if (!contractAddress.equals(this.contractAddress)) {
      throw new Error(`Contract ${this.contractAddress} cannot invalidate sync cache of ${contractAddress}`);
    }
    this.contractSyncService.invalidateContractForScopes(contractAddress, scopes);
  }

  // TODO(#11849): consider replacing this oracle with a pure Noir implementation of aes decryption.
  public decryptAes128(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  /**
   * Retrieves the app-siloed shared secret for a given address and ephemeral public key.
   * @param address - The address to get the secret for.
   * @param ephPk - The ephemeral public key to get the secret for.
   * @param contractAddress - The contract address for app-siloing (validated against execution context).
   * @returns The app-siloed shared secret as a Field.
   */
  public async getSharedSecret(address: AztecAddress, ephPk: Point, contractAddress: AztecAddress): Promise<Fr> {
    if (!contractAddress.equals(this.contractAddress)) {
      throw new Error(
        `getSharedSecret called with contract address ${contractAddress}, expected ${this.contractAddress}`,
      );
    }
    const recipientCompleteAddress = await this.getCompleteAddressOrFail(address);
    const ivskM = await this.keyStore.getMasterSecretKey(
      recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey,
    );
    const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
    return deriveAppSiloedSharedSecret(addressSecret, ephPk, this.contractAddress);
  }

  public pushEphemeral(slot: Fr, elements: Fr[]): number {
    return this.ephemeralArrayService.push(slot, elements);
  }

  public popEphemeral(slot: Fr): Fr[] {
    return this.ephemeralArrayService.pop(slot);
  }

  public getEphemeral(slot: Fr, index: number): Fr[] {
    return this.ephemeralArrayService.get(slot, index);
  }

  public setEphemeral(slot: Fr, index: number, elements: Fr[]): void {
    this.ephemeralArrayService.set(slot, index, elements);
  }

  public getEphemeralLen(slot: Fr): number {
    return this.ephemeralArrayService.len(slot);
  }

  public removeEphemeral(slot: Fr, index: number): void {
    this.ephemeralArrayService.remove(slot, index);
  }

  public clearEphemeral(slot: Fr): void {
    this.ephemeralArrayService.clear(slot);
  }

  public emitOffchainEffect(data: Fr[]): Promise<void> {
    this.offchainEffects.push({ data, contractAddress: this.contractAddress });
    return Promise.resolve();
  }

  /** Executes another utility function from within this one and returns its serialized return values. */
  public async callUtilityFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
  ): Promise<Fr[]> {
    const targetArtifact = await this.contractStore.getFunctionArtifactWithDebugMetadata(
      targetContractAddress,
      functionSelector,
    );

    if (!targetContractAddress.equals(this.contractAddress)) {
      const request = {
        caller: this.contractAddress,
        target: targetContractAddress,
        functionSelector,
        functionName: targetArtifact.name,
        args,
        callerContext: ('isPrivate' in this ? 'private' : 'utility') as 'private' | 'utility',
      };

      const response = this.hooks
        ? await this.hooks.authorizeUtilityCall(request)
        : { authorized: false, reason: 'No execution hooks configured' };

      if (!response.authorized) {
        const reason = response.reason ? `: ${response.reason}` : '';
        throw new Error(
          `Cross-contract utility call denied${reason}. ${this.contractAddress} attempted to call ` +
            `${targetContractAddress}:${functionSelector} (${targetArtifact.name}). ` +
            `See https://docs.aztec.network/errors/11`,
        );
      }

      await this.contractSyncService.ensureContractSynced(
        targetContractAddress,
        functionSelector,
        this.utilityExecutor,
        this.anchorBlockHeader,
        this.jobId,
        this.scopes,
      );
    }

    this.logger.debug(
      `Calling nested utility function ${targetContractAddress}:${functionSelector} from ${this.contractAddress}`,
    );

    const nestedOracle = new UtilityExecutionOracle({
      contractAddress: targetContractAddress,
      authWitnesses: this.authWitnesses,
      capsules: this.capsules,
      anchorBlockHeader: this.anchorBlockHeader,
      contractStore: this.contractStore,
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: this.aztecNode,
      recipientTaggingStore: this.recipientTaggingStore,
      senderAddressBookStore: this.senderAddressBookStore,
      capsuleService: this.capsuleService,
      factService: this.factService,
      privateEventStore: this.privateEventStore,
      messageContextService: this.messageContextService,
      contractSyncService: this.contractSyncService,
      l2TipsStore: this.l2TipsStore,
      jobId: this.jobId,
      scopes: this.scopes,
      simulator: this.simulator,
      hooks: this.hooks,
      utilityExecutor: this.utilityExecutor,
      log: this.logger,
    });

    const initialWitness = toACVMWitness(0, args);
    const acvmCallback = new Oracle(nestedOracle);
    const acirExecutionResult = await this.simulator
      .executeUserCircuit(initialWitness, targetArtifact, acvmCallback.toACIRCallback())
      .catch((err: Error) => {
        err.message = resolveAssertionMessageFromError(err, targetArtifact);
        throw new ExecutionError(
          err.message,
          { contractAddress: targetContractAddress, functionSelector },
          extractCallStack(err, targetArtifact.debug),
          { cause: err },
        );
      });

    return witnessMapToFields(acirExecutionResult.returnWitness);
  }

  /** Returns offchain effects collected during execution. */
  public getOffchainEffects(): OffchainEffect[] {
    return this.offchainEffects;
  }

  /**
   * Fetches tx effects for the given hashes in parallel, deduplicating repeated hashes so each tx is only requested
   * once. Returns a map keyed by `TxHash.toString()`; hashes for which the node has no tx effect are omitted.
   */
  async #fetchTxEffects(txHashes: TxHash[]): Promise<Map<string, IndexedTxEffect>> {
    const uniqueTxHashes = uniqueBy(txHashes, h => h.toString());
    const fetched = await Promise.all(uniqueTxHashes.map(h => this.aztecNode.getTxEffect(h)));
    return new Map(
      uniqueTxHashes
        .map((h, i): [string, IndexedTxEffect | undefined] => [h.toString(), fetched[i]])
        .filter((entry): entry is [string, IndexedTxEffect] => entry[1] !== undefined),
    );
  }

  /** Runs a query concurrently with a validation that the block hash is not ahead of the anchor block. */
  async #queryWithBlockHashNotAfterAnchor<T>(blockHash: BlockHash, query: () => Promise<T>): Promise<T> {
    // Most contracts query state at the "current" block, which is the anchor. Skip the validation when we can.
    const anchorHash = await this.anchorBlockHeader.hash();
    if (blockHash.equals(anchorHash)) {
      return query();
    }

    const [response] = await Promise.all([
      query(),
      (async () => {
        const block = await this.aztecNode.getBlock(blockHash);
        const header = block?.header;
        if (!header) {
          throw new Error(`Could not find block header for block hash ${blockHash}`);
        }

        if (header.getBlockNumber() > this.anchorBlockHeader.getBlockNumber()) {
          throw new Error(
            `Made a node query with a reference block hash ${blockHash} with block number ${header.getBlockNumber()}, which is ahead of the anchor block number ${this.anchorBlockHeader.getBlockNumber()} (from anchor block hash ${anchorHash}).`,
          );
        }
      })(),
    ]);
    return response;
  }
}

/** Splits a buffer of concatenated 32-byte field representations back into `Fr`s. */
function bufferToFields(buf: Buffer): Fr[] {
  const fields: Fr[] = [];
  for (let offset = 0; offset < buf.length; offset += Fr.SIZE_IN_BYTES) {
    fields.push(Fr.fromBuffer(buf.subarray(offset, offset + Fr.SIZE_IN_BYTES)));
  }
  return fields;
}
