import { ARCHIVE_HEIGHT, type NOTE_HASH_TREE_HEIGHT, PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { uniqueBy } from '@aztec/foundation/collection';
import { Aes128 } from '@aztec/foundation/crypto/aes128';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { LogLevels, type Logger, createLogger } from '@aztec/foundation/log';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import {
  type CircuitSimulator,
  ExecutionError,
  extractCallStack,
  resolveAssertionMessageFromError,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator/client';
import {
  HISTORICAL_STANDARD_HANDSHAKE_REGISTRY_ADDRESSES,
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
} from '@aztec/standard-contracts/handshake-registry/constants';
import { type FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type L2TipsProvider } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstancePreimageWithAddress, PartialAddress } from '@aztec/stdlib/contract';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { PublicKeys, computeAddressSecret, hashPublicKey } from '@aztec/stdlib/keys';
import { AppTaggingSecret, FlatPublicLogs, appSiloEcdhSharedSecret } from '@aztec/stdlib/logs';
import { type UnsiloedMessageNullifier, getL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import type { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import {
  type BlockHeader,
  CallContext,
  type Capsule,
  type OffchainEffect,
  type TxEffect,
  type TxHash,
  type TxReceipt,
} from '@aztec/stdlib/tx';

import type { ContractSyncService } from '../../contract/contract_sync_service.js';
import { createContractLogger, logContractMessage, stripAztecnrLogPrefix } from '../../contract_logging.js';
import { EventService, type EventValidationTxData } from '../../events/event_service.js';
import type { UtilityCallAuthorizationRequest } from '../../hooks/authorize_utility_call.js';
import type { ExecutionHooks } from '../../hooks/index.js';
import { LogService, type RetrievedTaggedLog } from '../../logs/log_service.js';
import { type TxOnchainContext, TxResolverService } from '../../messages/tx_resolver_service.js';
import { NoteService, type NoteValidationTxData } from '../../notes/note_service.js';
import { ORACLE_VERSION_MAJOR } from '../../oracle_version.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import { assertAllowedScope } from '../../storage/allowed_scopes.js';
import type { CapsuleService } from '../../storage/capsule_store/capsule_service.js';
import { FactCollectionKey, FactCollectionTypeKey, anchoredTipBlockNumbers } from '../../storage/fact_store/index.js';
import type { FactService, OriginBlock } from '../../storage/fact_store/index.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { TaggingSecretSourcesStore } from '../../storage/tagging_store/tagging_secret_sources_store.js';
import type { AnchoredContractData } from '../anchored_contract_data.js';
import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { BoundedVec } from '../noir-structs/bounded_vec.js';
import type { EmbeddedCurvePoint } from '../noir-structs/embedded_curve_point.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import type { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { type FactCollection, emptyFactCollection, toNoirFactCollection } from '../noir-structs/fact_collection.js';
import type { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import type { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import type { NoteData } from '../noir-structs/note_data.js';
import type { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import { Option } from '../noir-structs/option.js';
import type { PendingTaggedLog } from '../noir-structs/pending_tagged_log.js';
import type { ProvidedSecret } from '../noir-structs/provided_secret.js';
import type { ResolvedTx } from '../noir-structs/resolved_tx.js';
import type { TxEffectData } from '../noir-structs/tx_effect_data.js';
import type { UtilityContext } from '../noir-structs/utility_context.js';
import { pickNotes } from '../pick_notes.js';
import type { TransientArrayService } from '../transient_array_service.js';
import { buildACIRCallback } from './acir_callback.js';
import type { IMiscOracle, IUtilityExecutionOracle } from './interfaces.js';

/** Args for UtilityExecutionOracle constructor. */
export type UtilityExecutionOracleArgs = {
  callContext: CallContext;
  /** List of transient auth witnesses to be used during this simulation */
  authWitnesses: AuthWitness[];
  capsules: Capsule[]; // TODO(#12425): Rename to transientCapsules
  anchorBlockHeader: BlockHeader;
  anchoredContractData: AnchoredContractData;
  noteStore: NoteStore;
  keyStore: KeyStore;
  addressStore: AddressStore;
  aztecNode: AztecNode;
  recipientTaggingStore: RecipientTaggingStore;
  taggingSecretSourcesStore: TaggingSecretSourcesStore;
  capsuleService: CapsuleService;
  factService: FactService;
  privateEventStore: PrivateEventStore;
  txResolver: TxResolverService;
  contractSyncService: ContractSyncService;
  l2TipsStore: L2TipsProvider;
  jobId: string;
  log?: ReturnType<typeof createLogger>;
  scopes: AztecAddress[];
  simulator: CircuitSimulator;
  hooks?: ExecutionHooks;
  /** Needed to trigger contract synchronization before nested cross-contract calls. */
  utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<void>;
  transientArrayService: TransientArrayService;
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
  protected readonly transientArrayService: TransientArrayService;
  /** Keyed by tx hash string. */
  private readonly txReceiptsCache = new Map<string, Promise<TxReceipt<{ includeTxEffect: true }>>>();
  /**
   * Information that can be used to validate the existence of a note or an event, keyed by tx hash string. It is
   * populated by the node queries that precede validation (tagged log retrieval, tx resolution), which already return
   * everything validation needs, so validating a note or event created in one of those txs costs no node roundtrip.
   * Notes and events reached through other paths (e.g. offchain inbox messages) still need a receipt.
   */
  private readonly validationTxDataCache = new Map<string, ValidationTxData>();

  // We store oracle version to be able to show a nice error message when an oracle handler is missing.
  private contractOracleVersion: { major: number; minor: number } | undefined;

  protected readonly callContext: CallContext;
  protected readonly authWitnesses: AuthWitness[];
  protected readonly capsules: Capsule[];
  protected readonly anchorBlockHeader: BlockHeader;
  protected readonly anchoredContractData: AnchoredContractData;
  protected readonly noteStore: NoteStore;
  protected readonly keyStore: KeyStore;
  protected readonly addressStore: AddressStore;
  protected readonly aztecNode: AztecNode;
  protected readonly recipientTaggingStore: RecipientTaggingStore;
  protected readonly taggingSecretSourcesStore: TaggingSecretSourcesStore;
  protected readonly capsuleService: CapsuleService;
  protected readonly factService: FactService;
  protected readonly privateEventStore: PrivateEventStore;
  protected readonly txResolver: TxResolverService;
  protected readonly contractSyncService: ContractSyncService;
  protected readonly l2TipsStore: L2TipsProvider;
  protected readonly jobId: string;
  protected logger: ReturnType<typeof createLogger>;
  protected readonly scopes: AztecAddress[];
  protected readonly simulator: CircuitSimulator;
  protected readonly hooks: ExecutionHooks | undefined;
  protected readonly utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<void>;

  constructor(args: UtilityExecutionOracleArgs) {
    this.callContext = args.callContext;
    this.authWitnesses = args.authWitnesses;
    this.capsules = args.capsules;
    this.anchorBlockHeader = args.anchorBlockHeader;
    this.anchoredContractData = args.anchoredContractData;
    this.noteStore = args.noteStore;
    this.keyStore = args.keyStore;
    this.addressStore = args.addressStore;
    this.aztecNode = args.aztecNode;
    this.recipientTaggingStore = args.recipientTaggingStore;
    this.taggingSecretSourcesStore = args.taggingSecretSourcesStore;
    this.capsuleService = args.capsuleService;
    this.factService = args.factService;
    this.privateEventStore = args.privateEventStore;
    this.txResolver = args.txResolver;
    this.contractSyncService = args.contractSyncService;
    this.l2TipsStore = args.l2TipsStore;
    this.jobId = args.jobId;
    this.logger = args.log ?? createLogger('simulator:client_view_context');
    this.scopes = args.scopes;
    this.simulator = args.simulator;
    this.hooks = args.hooks;
    this.utilityExecutor = args.utilityExecutor;
    this.transientArrayService = args.transientArrayService;
  }

  public assertCompatibleOracleVersion(major: number, minor: number): void {
    if (major !== ORACLE_VERSION_MAJOR) {
      const hint =
        major > ORACLE_VERSION_MAJOR
          ? 'The contract was compiled with a newer version of Aztec.nr than your private environment supports. Upgrade your private environment to a compatible version.'
          : 'The contract was compiled with an older version of Aztec.nr than your private environment supports. Recompile the contract with a compatible version of Aztec.nr.';
      throw new Error(
        `Incompatible private environment version: ${hint} See https://docs.aztec.network/errors/8 (expected oracle major version ${ORACLE_VERSION_MAJOR}, got ${major})`,
      );
    }

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
    return {
      blockHeader: this.anchorBlockHeader,
      contractAddress: this.callContext.contractAddress,
      msgSender: this.callContext.msgSender,
    };
  }

  /**
   * Retrieve keys associated with a specific master public key and app address.
   * @param pkMHash - The master public key hash.
   * @param _keyIndex - Sent by the Noir oracle caller but unused here; kept to match the oracle signature.
   * @returns A Promise that resolves to nullifier keys.
   * @throws If the keys are not registered in the key store.
   * @throws If scopes are defined and the account is not in the scopes.
   */
  public async getKeyValidationRequest(pkMHash: Fr, _keyIndex: Fr): Promise<KeyValidationRequest> {
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
  public async getNoteHashMembershipWitness(
    blockHash: BlockHash,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>> {
    const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getNoteHashMembershipWitness(blockHash, noteHash),
    );
    if (!witness) {
      throw new Error(`Note hash ${noteHash} not found in the note hash tree at block ${blockHash.toString()}.`);
    }
    return witness;
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
  public async getBlockHashMembershipWitness(
    referenceBlockHash: BlockHash,
    blockHash: BlockHash,
  ): Promise<Option<MembershipWitness<typeof ARCHIVE_HEIGHT>>> {
    // Note that we validate that the reference block hash is at or before the anchor block - we don't test the block
    // hash at all. If the block hash did not exist by the reference block hash, then the node will not return the
    // membership witness as there is none.
    const witness = await this.#queryWithBlockHashNotAfterAnchor(referenceBlockHash, () =>
      this.aztecNode.getBlockHashMembershipWitness(referenceBlockHash, blockHash),
    );
    return witness ? Option.some(witness) : Option.none();
  }

  /** Returns whether each block hash is present in the archive tree at the referenced block. */
  public async areBlockHashesInArchive(
    referenceBlockHash: BlockHash,
    blockHashes: EphemeralArray<BlockHash>,
  ): Promise<EphemeralArray<boolean>> {
    const hashes = blockHashes.readAll(this.ephemeralArrayService);
    const memberships = await this.#queryWithBlockHashNotAfterAnchor(referenceBlockHash, () =>
      Promise.all(
        hashes.map(blockHash =>
          this.aztecNode.getBlockHashMembershipWitness(referenceBlockHash, blockHash).then(Boolean),
        ),
      ),
    );
    return EphemeralArray.fromValues(this.ephemeralArrayService, memberships);
  }

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  public async getNullifierMembershipWitness(blockHash: BlockHash, nullifier: Fr): Promise<NullifierMembershipWitness> {
    const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getNullifierMembershipWitness(blockHash, nullifier),
    );
    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${blockHash.toString()}.`);
    }
    return witness;
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
  public async getLowNullifierMembershipWitness(
    blockHash: BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness> {
    const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getLowNullifierMembershipWitness(blockHash, nullifier),
    );
    if (!witness) {
      throw new Error(
        `Low nullifier witness not found for nullifier ${nullifier} at block hash ${blockHash.toString()}.`,
      );
    }
    return witness;
  }

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param leafSlot - The slot of the public data tree to get the witness for.
   * @returns - The witness
   */
  public async getPublicDataWitness(blockHash: BlockHash, leafSlot: Fr): Promise<PublicDataWitness> {
    const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, () =>
      this.aztecNode.getPublicDataWitness(blockHash, leafSlot),
    );
    if (!witness) {
      throw new Error(`Public data witness not found for slot ${leafSlot} at block hash ${blockHash.toString()}.`);
    }
    return witness;
  }

  /**
   * Fetches a block header of a given block.
   * @param blockNumber - The number of a block of which to get the block header.
   * @returns Block extracted from a block with block number `blockNumber`.
   */
  public async getBlockHeader(blockNumber: BlockNumber): Promise<BlockHeader> {
    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();
    if (blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }

    // Most contracts query state at the "current" block, which is the anchor. Skip the RPC when we can.
    if (blockNumber === anchorBlockNumber) {
      return this.anchorBlockHeader;
    }

    const block = await this.aztecNode.getBlock(blockNumber);
    if (!block?.header) {
      throw new Error(`Block header not found for block ${blockNumber}.`);
    }
    return block.header;
  }

  /**
   * Retrieve the public keys and partial address associated to a given address.
   * @param account - The account address.
   * @returns The public keys and partial address, or `undefined` if the account is not registered.
   */
  public async getPublicKeysAndPartialAddress(
    account: AztecAddress,
  ): Promise<Option<{ publicKeys: PublicKeys; partialAddress: PartialAddress }>> {
    const completeAddress = await this.addressStore.getCompleteAddress(account);
    if (!completeAddress) {
      return Option.none();
    }
    return Option.some({ publicKeys: completeAddress.publicKeys, partialAddress: completeAddress.partialAddress });
  }

  protected async getCompleteAddressOrFail(account: AztecAddress): Promise<CompleteAddress> {
    const completeAddress = await this.addressStore.getCompleteAddress(account);
    if (!completeAddress) {
      throw new Error(
        `No public key registered for address ${account}.
        Register it by calling wallet.registerSender(...).\nSee docs for context: https://docs.aztec.network/errors/14`,
      );
    }
    return completeAddress;
  }

  /**
   * Returns a contract instance associated with an address or throws if not found.
   * @param address - Address.
   * @returns A contract instance.
   */
  public async getContractInstance(address: AztecAddress): Promise<ContractInstancePreimageWithAddress> {
    const instance = await this.anchoredContractData.getContractInstance(address);
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
  public getAuthWitness(messageHash: Fr): Promise<Fr[]> {
    const witness = this.authWitnesses.find(w => w.requestHash.equals(messageHash))?.witness;
    if (!witness) {
      throw new Error(`Unknown auth witness for message hash ${messageHash}`);
    }
    return Promise.resolve(witness);
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
    owner: Option<AztecAddress>,
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
    maxNotes: number,
    packedHintedNoteLength: number,
  ): Promise<BoundedVec<NoteData>> {
    const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.jobId);

    const dbNotes = await noteService.getNotes(this.contractAddress, owner.value, storageSlot, status, this.scopes);
    const picked = pickNotes<NoteData>(dbNotes, {
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
    return BoundedVec.from({ data: picked, maxLength: maxNotes, elementSize: packedHintedNoteLength });
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
   * Returns the membership witness of an L1 to L2 message.
   * @param messageHash - Hash of the message.
   * @param nullifier - When present, the unsiloed nullifier of the message and the address to silo it with. The witness
   * is only returned if the siloed nullifier is absent from the nullifier tree, i.e. the message has not been consumed.
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  public async getL1ToL2MembershipWitnessV2(messageHash: Fr, nullifier: Option<UnsiloedMessageNullifier>) {
    const [messageIndex, siblingPath] = await getL1ToL2MessageWitness(
      this.aztecNode,
      messageHash,
      nullifier.value,
      await this.anchorBlockHeader.hash(),
    );

    return { index: messageIndex, siblingPath };
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
        .map((_, i) => new Fr(startStorageSlot.toBigInt() + BigInt(i)));
      const values = await Promise.all(
        slots.map(storageSlot => this.aztecNode.getPublicStorageAt(blockHash, contractAddress, storageSlot)),
      );

      this.logger.debug(
        `Oracle storage read: start=${startStorageSlot.toString()} count=${numberOfElements} ` +
          `address=${contractAddress.toString()} values=[${values.join(', ')}]`,
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
        addr => this.anchoredContractData.getDebugContractName(addr),
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
        addr => this.anchoredContractData.getDebugContractName(addr),
        'aztecnr',
        { instanceId: this.jobId },
      );
    }
    return this.aztecnrLogger;
  }

  public async log(level: number, message: string, _fieldsSize: number, fields: Fr[]): Promise<void> {
    if (!LogLevels[level]) {
      throw new Error(`Invalid log level: ${level}`);
    }

    const { kind, message: strippedMessage } = stripAztecnrLogPrefix(message);

    const logger = kind == 'aztecnr' ? await this.#getAztecnrLogger() : await this.#getContractLogger();
    logContractMessage(logger, LogLevels[level], strippedMessage, fields);
  }

  /** Fetches pending tagged logs into a freshly allocated ephemeral array and returns it. */
  public async getPendingTaggedLogsV2(
    scope: AztecAddress,
    providedSecrets: EphemeralArray<ProvidedSecret>,
  ): Promise<EphemeralArray<PendingTaggedLog>> {
    const secrets = providedSecrets
      .readAll(this.ephemeralArrayService)
      .map(ps => new AppTaggingSecret(ps.secret, this.contractAddress, ps.mode));

    const logService = this.#createLogService();
    const retrievedLogs = await logService.fetchTaggedLogs(this.contractAddress, scope, secrets);

    this.#cacheValidationTxData(retrievedLogs);

    return EphemeralArray.fromValues(this.ephemeralArrayService, retrievedLogs.map(toPendingTaggedLog));
  }

  #createLogService(): LogService {
    return new LogService(
      this.aztecNode,
      this.anchorBlockHeader,
      this.l2TipsStore,
      this.keyStore,
      this.recipientTaggingStore,
      this.taggingSecretSourcesStore,
      this.addressStore,
      this.scopes,
      this.jobId,
      this.logger.getBindings(),
    );
  }

  public async validateAndStoreEnqueuedNotesAndEvents(
    noteValidationRequests: EphemeralArray<NoteValidationRequest>,
    eventValidationRequests: EphemeralArray<EventValidationRequest>,
    scope: AztecAddress,
  ) {
    await this.#processValidationRequests(
      noteValidationRequests.readAll(this.ephemeralArrayService),
      eventValidationRequests.readAll(this.ephemeralArrayService),
      scope,
    );
  }

  async #processValidationRequests(
    noteValidationRequests: NoteValidationRequest[],
    eventValidationRequests: EventValidationRequest[],
    scope: AztecAddress,
  ) {
    const validationTxData = await this.#getValidationTxData([
      ...noteValidationRequests.map(r => r.txHash),
      ...eventValidationRequests.map(r => r.txHash),
    ]);

    const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.jobId);
    const eventService = new EventService(this.anchorBlockHeader, this.aztecNode, this.privateEventStore, this.jobId);

    await Promise.all([
      noteService.validateAndStoreNotes(noteValidationRequests, scope, validationTxData),
      eventService.validateAndStoreEvents(eventValidationRequests, scope, validationTxData),
    ]);
  }

  public async getLogsByTagV2(
    requests: EphemeralArray<LogRetrievalRequest>,
  ): Promise<EphemeralArray<EphemeralArray<LogRetrievalResponse>>> {
    const logRetrievalRequests = requests.readAll(this.ephemeralArrayService);
    const logService = this.#createLogService();

    const retrievedLogsPerRequest = await logService.fetchLogsByTag(this.contractAddress, logRetrievalRequests);

    this.#cacheValidationTxData(retrievedLogsPerRequest.flat());

    // Create an inner ephemeral array for each request's matching logs, then wrap all slots in an outer array.
    const innerArrays = retrievedLogsPerRequest.map(retrievedLogs =>
      EphemeralArray.fromValues(this.ephemeralArrayService, retrievedLogs.map(toLogRetrievalResponse)),
    );

    return EphemeralArray.fromValues(this.ephemeralArrayService, innerArrays);
  }

  /** Given an array of tx hashes, returns an aligned array of tx info if the tx is available. */
  public async getResolvedTxs(requests: EphemeralArray<Fr>): Promise<EphemeralArray<Option<ResolvedTx>>> {
    const txHashes = requests.readAll(this.ephemeralArrayService);

    const resolved = await this.txResolver.resolveTxs(txHashes, this.anchorBlockHeader.getBlockNumber());

    this.#cacheValidationTxData(resolved.filter(tx => tx !== null));

    const options = resolved.map(tx => (tx ? Option.some(toResolvedTx(tx)) : Option.none<ResolvedTx>()));
    return EphemeralArray.fromValues(this.ephemeralArrayService, options);
  }

  /**
   * Fetches the effects of a transaction by its hash. Returns null if the tx is not found or is beyond the anchor
   * block.
   */
  public async getTxEffect(txHash: TxHash): Promise<Option<TxEffectData>> {
    if (txHash.hash.isZero()) {
      throw new Error('Invalid tx hash passed into aztec_utl_getTxEffect oracle handler');
    }

    return await this.#getTxEffectOption(txHash);
  }

  /** Fetches transaction effects for all hashes, preserving request order. */
  public async getTxEffects(txHashes: EphemeralArray<TxHash>): Promise<EphemeralArray<Option<TxEffectData>>> {
    const hashes = txHashes.readAll(this.ephemeralArrayService);
    const invalidHash = hashes.find(txHash => txHash.hash.isZero());
    if (invalidHash) {
      throw new Error('Invalid tx hash passed into aztec_utl_getTxEffects oracle handler');
    }

    const uniqueTxHashes = uniqueBy(hashes, h => h.toString());
    const options = await Promise.all(uniqueTxHashes.map(txHash => this.#getTxEffectOption(txHash)));
    const optionsByHash = new Map(uniqueTxHashes.map((txHash, i) => [txHash.toString(), options[i]]));

    return EphemeralArray.fromValues(
      this.ephemeralArrayService,
      hashes.map(txHash => optionsByHash.get(txHash.toString())!),
    );
  }

  public setCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], scope: AztecAddress): void {
    this.#assertOwnContract(contractAddress);
    this.capsuleService.setCapsule(contractAddress, slot, capsule, this.jobId, scope);
  }

  public async getCapsule(
    contractAddress: AztecAddress,
    slot: Fr,
    tSize: number,
    scope: AztecAddress,
  ): Promise<Option<Fr[]>> {
    this.#assertOwnContract(contractAddress);
    const values = await this.capsuleService.getCapsule(contractAddress, slot, this.jobId, scope, this.capsules);
    return values ? Option.some(values) : Option.none({ length: tSize });
  }

  public deleteCapsule(contractAddress: AztecAddress, slot: Fr, scope: AztecAddress): void {
    this.#assertOwnContract(contractAddress);
    this.capsuleService.deleteCapsule(contractAddress, slot, this.jobId, scope);
  }

  public copyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
    scope: AztecAddress,
  ): Promise<void> {
    this.#assertOwnContract(contractAddress);
    return this.capsuleService.copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, this.jobId, scope);
  }

  /**
   * Asserts the executing contract may only access its own slice of PXE DB.
   */
  #assertOwnContract(contractAddress: AztecAddress): void {
    if (!contractAddress.equals(this.contractAddress)) {
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
  }

  /**
   * Records a fact into a collection. A `Some` origin block makes the fact retractable (pruned on reorg of that
   * block), a `None` origin block makes it non-retractable, surviving reorgs.
   */
  public recordFact(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    factCollectionTypeId: Fr,
    factCollectionId: Fr,
    factTypeId: Fr,
    payload: EphemeralArray<Fr>,
    originBlock: Option<OriginBlock>,
  ): Promise<void> {
    this.#assertOwnContract(contractAddress);
    return this.factService.recordFact(
      new FactCollectionKey(contractAddress, scope, factCollectionTypeId, factCollectionId),
      factTypeId,
      payload.readAll(this.ephemeralArrayService),
      originBlock.isSome() ? originBlock.value : undefined,
      this.jobId,
    );
  }

  /**
   * Deletes a fact collection, removing all its facts. A no-op if no such collection exists.
   */
  public deleteFactCollection(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    factCollectionTypeId: Fr,
    factCollectionId: Fr,
  ): Promise<void> {
    this.#assertOwnContract(contractAddress);
    return this.factService.deleteFactCollection(
      new FactCollectionKey(contractAddress, scope, factCollectionTypeId, factCollectionId),
      this.jobId,
    );
  }

  /**
   * Returns a fact collection.
   */
  public async getFactCollection(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    factCollectionTypeId: Fr,
    factCollectionId: Fr,
  ): Promise<Option<FactCollection>> {
    this.#assertOwnContract(contractAddress);
    const tips = anchoredTipBlockNumbers(await this.l2TipsStore.getL2Tips(), this.anchorBlockHeader.getBlockNumber());
    const collection = await this.factService.getFactCollection(
      new FactCollectionKey(contractAddress, scope, factCollectionTypeId, factCollectionId),
      tips,
      this.jobId,
    );
    return collection
      ? Option.some(
          toNoirFactCollection(
            this.ephemeralArrayService,
            contractAddress,
            scope,
            factCollectionTypeId,
            factCollectionId,
            collection.facts,
          ),
        )
      : Option.none(emptyFactCollection(this.ephemeralArrayService));
  }

  /** Returns every fact collection of `factCollectionTypeId`. */
  public async getFactCollectionsByType(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    factCollectionTypeId: Fr,
  ): Promise<EphemeralArray<FactCollection>> {
    this.#assertOwnContract(contractAddress);
    const tips = anchoredTipBlockNumbers(await this.l2TipsStore.getL2Tips(), this.anchorBlockHeader.getBlockNumber());
    const collections = await this.factService.getFactCollectionsByType(
      new FactCollectionTypeKey(contractAddress, scope, factCollectionTypeId),
      tips,
      this.jobId,
    );
    return EphemeralArray.fromValues(
      this.ephemeralArrayService,
      collections.map(collection =>
        toNoirFactCollection(
          this.ephemeralArrayService,
          collection.key.contractAddress,
          collection.key.scope,
          collection.key.factCollectionTypeId,
          collection.key.factCollectionId,
          collection.facts,
        ),
      ),
    );
  }

  /**
   * Clears cached sync state for a contract for a set of scopes, forcing re-sync on the next query so that newly
   * stored notes or events are discovered.
   */
  public setContractSyncCacheInvalid(contractAddress: AztecAddress, scopes: BoundedVec<AztecAddress>): void {
    if (!contractAddress.equals(this.contractAddress)) {
      throw new Error(`Contract ${this.contractAddress} cannot invalidate sync cache of ${contractAddress}`);
    }
    this.contractSyncService.invalidateContractForScopes(contractAddress, scopes.data);
  }

  // TODO(#11849): consider replacing this oracle with a pure Noir implementation of aes decryption.
  public async decryptAes128(
    ciphertext: BoundedVec<number>,
    iv: number[],
    symKey: number[],
  ): Promise<Option<BoundedVec<number>>> {
    const capacity = ciphertext.maxLength;
    try {
      const aes128 = new Aes128();
      const plaintext = await aes128.decryptBufferCBC(
        Buffer.from(ciphertext.data),
        Buffer.from(iv),
        Buffer.from(symKey),
      );
      return Option.some(BoundedVec.from<number>({ data: [...plaintext], maxLength: capacity }));
    } catch {
      return Option.none({ maxLength: capacity });
    }
  }

  /**
   * Retrieves app-siloed shared secrets for multiple ephemeral public keys stored in an ephemeral array.
   * @param address - The recipient address.
   * @param ephPks - Ephemeral array containing the serialized Points.
   * @param contractAddress - The contract address for app-siloing (validated against execution context).
   * @returns A new ephemeral array containing the computed shared secrets, or an empty array when the PXE does not
   * hold the keys for `address`.
   * @throws If `address` is not in the execution's allowed scopes.
   */
  public async getSharedSecrets(
    address: AztecAddress,
    ephPks: EphemeralArray<EmbeddedCurvePoint>,
    contractAddress: AztecAddress,
  ): Promise<EphemeralArray<Fr>> {
    if (!contractAddress.equals(this.contractAddress)) {
      throw new Error(
        `getSharedSecrets called with contract address ${contractAddress}, expected ${this.contractAddress}`,
      );
    }

    assertAllowedScope(address, this.scopes);

    // An address can be in scope without the PXE holding its keys (e.g. syncing a registered but non-owned account),
    // in which case no secrets can be derived and we return an empty array rather than failing.
    const recipientCompleteAddress = await this.addressStore.getCompleteAddress(address);
    if (!recipientCompleteAddress) {
      this.logger.warn(
        `Computing shared secrets for address ${address} whose keys are not held - returning no secrets`,
        {
          address,
          contractAddress: this.contractAddress,
        },
      );
      return EphemeralArray.fromValues<Fr>(this.ephemeralArrayService, []);
    }
    const ivpkMHash = await hashPublicKey(recipientCompleteAddress.publicKeys.ivpkM);
    const ivskM = await this.keyStore.getMasterSecretKey(ivpkMHash);
    const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);

    const ephPkPoints = ephPks.readAll(this.ephemeralArrayService);
    const secrets = await Promise.all(
      ephPkPoints.map(({ x, y }) => appSiloEcdhSharedSecret(addressSecret, new Point(x, y), this.contractAddress)),
    );

    return EphemeralArray.fromValues(this.ephemeralArrayService, secrets);
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

  public pushTransient(slot: Fr, elements: Fr[]): number {
    return this.transientArrayService.push(this.contractAddress, slot, elements);
  }

  public popTransient(slot: Fr): Fr[] {
    return this.transientArrayService.pop(this.contractAddress, slot);
  }

  public getTransient(slot: Fr, index: number): Fr[] {
    return this.transientArrayService.get(this.contractAddress, slot, index);
  }

  public setTransient(slot: Fr, index: number, elements: Fr[]): void {
    this.transientArrayService.set(this.contractAddress, slot, index, elements);
  }

  public getTransientLen(slot: Fr): number {
    return this.transientArrayService.len(this.contractAddress, slot);
  }

  public removeTransient(slot: Fr, index: number): void {
    this.transientArrayService.remove(this.contractAddress, slot, index);
  }

  public clearTransient(slot: Fr): void {
    this.transientArrayService.clear(this.contractAddress, slot);
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
    const targetArtifact = await this.anchoredContractData.getFunctionArtifactWithDebugMetadata(
      targetContractAddress,
      functionSelector,
    );
    if (!targetArtifact) {
      throw new Error(
        `Cannot call ${targetContractAddress}:${functionSelector}: the contract is not registered. ` +
          `Register it via wallet.registerContract(...).`,
      );
    }

    if (!targetContractAddress.equals(this.contractAddress)) {
      // Standard handshake registry reads are authorized by default; every other cross-contract call needs the hook.
      if (!(await isStandardHandshakeRegistryUtilityRead(targetContractAddress, functionSelector))) {
        const [callerClassId, targetClassId] = await Promise.all([
          this.anchoredContractData.getCurrentClassId(this.contractAddress),
          this.anchoredContractData.getCurrentClassId(targetContractAddress),
        ]);
        if (!callerClassId || !targetClassId) {
          throw new Error(
            `Cannot authorize utility call from ${this.contractAddress} to ${targetContractAddress}: ` +
              `${!callerClassId ? this.contractAddress : targetContractAddress} is not registered.`,
          );
        }
        const request: UtilityCallAuthorizationRequest = {
          caller: this.contractAddress,
          callerClassId,
          target: targetContractAddress,
          targetClassId,
          functionSelector,
          functionName: targetArtifact.name,
          args,
          callerContext: this.callerContext,
        };

        const response = this.hooks?.authorizeUtilityCall
          ? await this.hooks.authorizeUtilityCall(request)
          : { authorized: false, reason: 'No authorizeUtilityCall hook configured' };

        if (!response.authorized) {
          const reason = response.reason ? `: ${response.reason}` : '';
          throw new Error(
            `Cross-contract utility call denied${reason}. ${this.contractAddress} attempted to call ` +
              `${targetContractAddress}:${functionSelector} (${targetArtifact.name}). ` +
              `See https://docs.aztec.network/errors/11`,
          );
        }
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
      callContext: CallContext.from({
        msgSender: this.contractAddress,
        contractAddress: targetContractAddress,
        functionSelector,
        isStaticCall: true,
      }),
      authWitnesses: this.authWitnesses,
      capsules: this.capsules,
      anchorBlockHeader: this.anchorBlockHeader,
      anchoredContractData: this.anchoredContractData,
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: this.aztecNode,
      recipientTaggingStore: this.recipientTaggingStore,
      taggingSecretSourcesStore: this.taggingSecretSourcesStore,
      capsuleService: this.capsuleService,
      factService: this.factService,
      privateEventStore: this.privateEventStore,
      txResolver: this.txResolver,
      contractSyncService: this.contractSyncService,
      l2TipsStore: this.l2TipsStore,
      jobId: this.jobId,
      scopes: this.scopes,
      simulator: this.simulator,
      hooks: this.hooks,
      utilityExecutor: this.utilityExecutor,
      log: this.logger,
      // Shared across the whole execution tree: nested utility frames inherit the caller's transient-array store.
      transientArrayService: this.transientArrayService,
    });

    const initialWitness = toACVMWitness(0, args);
    const acirExecutionResult = await this.simulator
      .executeUserCircuit(initialWitness, targetArtifact, buildACIRCallback(nestedOracle))
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

  /** Stores the onchain context of the given txs, so that validating the notes and events they created is free. */
  #cacheValidationTxData(txs: TxOnchainContext[]) {
    txs.forEach(tx => this.validationTxDataCache.set(tx.txHash.toString(), toValidationTxData(tx)));
  }

  /**
   * Returns the information needed to validate the notes and events created in the given txs, keyed by
   * `TxHash.toString()`. Txs already in {@link validationTxDataCache} cost no node request, and the rest are read from
   * the node. Txs with no tx effect are absent from the returned map.
   */
  async #getValidationTxData(txHashes: TxHash[]): Promise<Map<string, ValidationTxData>> {
    const known: [string, ValidationTxData][] = [];
    const misses: TxHash[] = [];
    for (const txHash of uniqueBy(txHashes, h => h.toString())) {
      const key = txHash.toString();
      const cached = this.validationTxDataCache.get(key);
      if (cached) {
        known.push([key, cached]);
      } else {
        misses.push(txHash);
      }
    }

    const fetched = await Promise.all(misses.map(h => this.#getTxReceiptWithEffect(h)));
    return new Map([
      ...known,
      ...misses
        .map((h, i): [string, ValidationTxData | undefined] => {
          const receipt = fetched[i];
          if (!receipt.isMined() || !receipt.txEffect) {
            return [h.toString(), undefined];
          }
          return [
            h.toString(),
            {
              noteHashes: receipt.txEffect.noteHashes,
              nullifiers: receipt.txEffect.nullifiers,
              l2BlockNumber: receipt.blockNumber,
              l2BlockHash: receipt.blockHash,
              txIndexInBlock: receipt.txIndexInBlock,
            },
          ];
        })
        .filter((entry): entry is [string, ValidationTxData] => entry[1] !== undefined),
    ]);
  }

  /**
   * Reads a receipt with its effect, at most once per tx for the lifetime of this execution.
   *
   * A receipt is not cacheable in general, since pending, mined and dropped are all correct answers to the same call
   * over time. Within one execution it is: the execution is anchored at a fixed block, and validation runs in several
   * batches that name overlapping tx hashes, so re-reading would both cost extra requests and let one execution see a
   * tx as included in one batch and absent in the next.
   */
  #getTxReceiptWithEffect(txHash: TxHash) {
    const key = txHash.toString();
    let receipt = this.txReceiptsCache.get(key);
    if (!receipt) {
      receipt = this.aztecNode.getTxReceipt(txHash, { includeTxEffect: true }).catch(err => {
        this.txReceiptsCache.delete(key);
        throw err;
      });
      this.txReceiptsCache.set(key, receipt);
    }
    return receipt;
  }

  async #getTxEffectOption(txHash: TxHash): Promise<Option<TxEffectData>> {
    const receipt = await this.#getTxReceiptWithEffect(txHash);
    if (!receipt.isMined() || !receipt.txEffect || receipt.blockNumber > this.anchorBlockHeader.getBlockNumber()) {
      return Option.none();
    }
    return Option.some(this.#toTxEffectData(receipt.txEffect));
  }

  #toTxEffectData(txEffect: TxEffect): TxEffectData {
    return {
      ...txEffect,
      revertCode: txEffect.revertCode.getCode(),
      publicLogs: FlatPublicLogs.fromLogs(txEffect.publicLogs),
      contractClassLogs: txEffect.contractClassLogs.map(log => ({
        contractAddress: log.contractAddress,
        fields: log.fields.toFields(),
        emittedLength: log.emittedLength,
      })),
    };
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

  /** The execution context of the current call. */
  protected get callerContext(): 'private' | 'private view' | 'utility' {
    return 'utility';
  }

  /** The address of the contract whose function is being executed, from the call context. */
  protected get contractAddress(): AztecAddress {
    return this.callContext.contractAddress;
  }
}

// Registry reads that any contract may issue without an `authorizeUtilityCall` hook. The constrained-delivery
// library calls these implicitly for the app, and they are safe to default-authorize: `get_app_siloed_secrets`
// siloes every returned secret to `msg_sender`, and `get_non_interactive_handshakes` only exposes ephemeral public
// keys, from which the shared secret cannot be derived without the recipient's secret keys.
const STANDARD_HANDSHAKE_REGISTRY_DEFAULT_AUTHORIZED_READ_SIGNATURES = [
  'get_non_interactive_handshakes((Field),u32)',
  'get_app_siloed_secrets((Field),(Field))',
];

// Contracts compiled against an older release have that release's registry address baked into their bytecode, so
// historical deployments get the same default authorization as the current one.
const DEFAULT_AUTHORIZED_HANDSHAKE_REGISTRY_ADDRESSES = [
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  ...HISTORICAL_STANDARD_HANDSHAKE_REGISTRY_ADDRESSES,
];

async function doesSelectorHaveSignature(functionSelector: FunctionSelector, signature: string): Promise<boolean> {
  return functionSelector.equals(await FunctionSelector.fromSignature(signature));
}

/**
 * Whether a cross-contract utility call targets a default-authorized read function of a standard handshake
 * registry deployment (the current one or a superseded historical one).
 *
 * These reads are authorized by PXE for every wallet, without consulting the `authorizeUtilityCall` hook, so that
 * wallets don't need to know the handshake registry exists in order to deliver and discover messages through it.
 */
async function isStandardHandshakeRegistryUtilityRead(
  targetContractAddress: AztecAddress,
  functionSelector: FunctionSelector,
): Promise<boolean> {
  if (!DEFAULT_AUTHORIZED_HANDSHAKE_REGISTRY_ADDRESSES.some(address => targetContractAddress.equals(address))) {
    return false;
  }

  const matches = await Promise.all(
    STANDARD_HANDSHAKE_REGISTRY_DEFAULT_AUTHORIZED_READ_SIGNATURES.map(signature =>
      doesSelectorHaveSignature(functionSelector, signature),
    ),
  );
  return matches.some(Boolean);
}

function toPendingTaggedLog(retrievedLog: RetrievedTaggedLog): PendingTaggedLog {
  return { log: retrievedLog.logData, context: toResolvedTx(retrievedLog) };
}

function toResolvedTx(tx: TxOnchainContext): ResolvedTx {
  const { txHash, blockNumber, blockHash, noteHashes, nullifiers } = tx;
  return {
    txHash,
    uniqueNoteHashesInTx: noteHashes,
    firstNullifierInTx: nullifiers[0],
    blockNumber,
    blockHash: blockHash.toFr(),
  };
}

function toLogRetrievalResponse(retrievedLog: RetrievedTaggedLog): LogRetrievalResponse {
  const { logData, txHash, blockNumber, blockHash, blockTimestamp, noteHashes, nullifiers } = retrievedLog;
  return {
    // Skip the tag, and clip to the wire cap: public logs can exceed PRIVATE_LOG_CIPHERTEXT_LEN, which is the fixed
    // size of the oracle's BoundedVec slot. A no-op for private logs, which are already within the cap.
    logPayload: logData.slice(1, 1 + PRIVATE_LOG_CIPHERTEXT_LEN),
    txHash,
    uniqueNoteHashesInTx: noteHashes,
    firstNullifierInTx: nullifiers[0],
    blockNumber,
    blockTimestamp,
    blockHash,
  };
}

function toValidationTxData(tx: TxOnchainContext): ValidationTxData {
  const { blockNumber, blockHash, txIndexInBlock, noteHashes, nullifiers } = tx;
  return { noteHashes, nullifiers, l2BlockNumber: blockNumber, l2BlockHash: blockHash, txIndexInBlock };
}

/** The onchain context of a tx served to note and event validation: the union of what the two services read. */
type ValidationTxData = NoteValidationTxData & EventValidationTxData;
