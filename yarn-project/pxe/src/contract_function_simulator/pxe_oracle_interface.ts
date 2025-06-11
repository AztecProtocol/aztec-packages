import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr, Point } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import {
  EventSelector,
  type FunctionArtifactWithContractName,
  FunctionSelector,
  getFunctionArtifact,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock, L2Block, L2BlockNumber } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { computeAddressSecret, computeAppTaggingSecret } from '@aztec/stdlib/keys';
import {
  IndexedTaggingSecret,
  PendingTaggedLog,
  PrivateLogWithTxData,
  PublicLog,
  PublicLogWithTxData,
  TxScopedL2Log,
  deriveEcdhSharedSecret,
} from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import { Note, type NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';
import { TxHash } from '@aztec/stdlib/tx';

import type { ExecutionDataProvider, ExecutionStats } from '../contract_function_simulator/execution_data_provider.js';
import { MessageLoadOracleInputs } from '../contract_function_simulator/oracle/message_load_oracle_inputs.js';
import type { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import type { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import type { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';
import { NoteDao } from '../storage/note_data_provider/note_dao.js';
import type { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import type { PrivateEventDataProvider } from '../storage/private_event_data_provider/private_event_data_provider.js';
import type { SyncDataProvider } from '../storage/sync_data_provider/sync_data_provider.js';
import type { TaggingDataProvider } from '../storage/tagging_data_provider/tagging_data_provider.js';
import { EventValidationRequest } from './event_validation_request.js';
import { NoteValidationRequest } from './note_validation_request.js';
import type { ProxiedNode } from './proxied_node.js';
import { WINDOW_HALF_SIZE, getIndexedTaggingSecretsForTheWindow, getInitialIndexesMap } from './tagging_utils.js';

/**
 * A data layer that provides and stores information needed for simulating/proving a transaction.
 */
export class PXEOracleInterface implements ExecutionDataProvider {
  constructor(
    private aztecNode: AztecNode | ProxiedNode,
    private keyStore: KeyStore,
    private contractDataProvider: ContractDataProvider,
    private noteDataProvider: NoteDataProvider,
    private capsuleDataProvider: CapsuleDataProvider,
    private syncDataProvider: SyncDataProvider,
    private taggingDataProvider: TaggingDataProvider,
    private addressDataProvider: AddressDataProvider,
    private privateEventDataProvider: PrivateEventDataProvider,
    private log = createLogger('pxe:pxe_oracle_interface'),
  ) {}

  getKeyValidationRequest(pkMHash: Fr, contractAddress: AztecAddress): Promise<KeyValidationRequest> {
    return this.keyStore.getKeyValidationRequest(pkMHash, contractAddress);
  }

  async getCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
    const completeAddress = await this.addressDataProvider.getCompleteAddress(account);
    if (!completeAddress) {
      throw new Error(
        `No public key registered for address ${account}.
        Register it by calling pxe.registerAccount(...).\nSee docs for context: https://docs.aztec.network/developers/reference/debugging/aztecnr-errors#simulation-error-no-public-key-registered-for-address-0x0-register-it-by-calling-pxeregisterrecipient-or-pxeregisteraccount`,
      );
    }
    return completeAddress;
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    const instance = await this.contractDataProvider.getContractInstance(address);
    if (!instance) {
      throw new Error(`No contract instance found for address ${address.toString()}`);
    }
    return instance;
  }

  async getNotes(contractAddress: AztecAddress, storageSlot: Fr, status: NoteStatus, scopes?: AztecAddress[]) {
    const noteDaos = await this.noteDataProvider.getNotes({
      contractAddress,
      storageSlot,
      status,
      scopes,
    });
    return noteDaos.map(({ contractAddress, storageSlot, noteNonce, note, noteHash, siloedNullifier, index }) => ({
      contractAddress,
      storageSlot,
      noteNonce,
      note,
      noteHash,
      siloedNullifier,
      // PXE can use this index to get full MembershipWitness
      index,
    }));
  }

  async getFunctionArtifact(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName> {
    const artifact = await this.contractDataProvider.getFunctionArtifact(contractAddress, selector);
    if (!artifact) {
      throw new Error(`Function artifact not found for contract ${contractAddress} and selector ${selector}.`);
    }
    const debug = await this.contractDataProvider.getFunctionDebugMetadata(contractAddress, selector);
    return {
      ...artifact,
      debug,
    };
  }

  async getFunctionArtifactByName(
    contractAddress: AztecAddress,
    functionName: string,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const instance = await this.contractDataProvider.getContractInstance(contractAddress);
    if (!instance) {
      return;
    }
    const artifact = await this.contractDataProvider.getContractArtifact(instance.currentContractClassId);
    return artifact && getFunctionArtifact(artifact, functionName);
  }

  /**
   * Fetches a message from the db, given its key.
   * @param contractAddress - Address of a contract by which the message was emitted.
   * @param messageHash - Hash of the message.
   * @param secret - Secret used to compute a nullifier.
   * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  async getL1ToL2MembershipWitness(
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

  async getNullifierIndex(nullifier: Fr) {
    return await this.#findLeafIndex('latest', MerkleTreeId.NULLIFIER_TREE, nullifier);
  }

  async #findLeafIndex(blockNumber: L2BlockNumber, treeId: MerkleTreeId, leafValue: Fr): Promise<bigint | undefined> {
    const [leafIndex] = await this.aztecNode.findLeavesIndexes(blockNumber, treeId, [leafValue]);
    return leafIndex?.data;
  }

  public async getMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
    const leafIndex = await this.#findLeafIndex(blockNumber, treeId, leafValue);
    if (!leafIndex) {
      throw new Error(`Leaf value: ${leafValue} not found in ${MerkleTreeId[treeId]}`);
    }

    const siblingPath = await this.#getSiblingPath(blockNumber, treeId, leafIndex);

    return [new Fr(leafIndex), ...siblingPath];
  }

  async #getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: bigint): Promise<Fr[]> {
    switch (treeId) {
      case MerkleTreeId.NULLIFIER_TREE:
        return (await this.aztecNode.getNullifierSiblingPath(blockNumber, leafIndex)).toFields();
      case MerkleTreeId.NOTE_HASH_TREE:
        return (await this.aztecNode.getNoteHashSiblingPath(blockNumber, leafIndex)).toFields();
      case MerkleTreeId.PUBLIC_DATA_TREE:
        return (await this.aztecNode.getPublicDataSiblingPath(blockNumber, leafIndex)).toFields();
      case MerkleTreeId.ARCHIVE:
        return (await this.aztecNode.getArchiveSiblingPath(blockNumber, leafIndex)).toFields();
      default:
        throw new Error('Not implemented');
    }
  }

  public async getNullifierMembershipWitnessAtLatestBlock(nullifier: Fr) {
    return this.getNullifierMembershipWitness(await this.getBlockNumber(), nullifier);
  }

  public getNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.aztecNode.getNullifierMembershipWitness(blockNumber, nullifier);
  }

  public getLowNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.aztecNode.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  public async getBlock(blockNumber: number): Promise<L2Block | undefined> {
    return await this.aztecNode.getBlock(blockNumber);
  }

  public async getPublicDataWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return await this.aztecNode.getPublicDataWitness(blockNumber, leafSlot);
  }

  public async getPublicStorageAt(blockNumber: number, contract: AztecAddress, slot: Fr): Promise<Fr> {
    return await this.aztecNode.getPublicStorageAt(blockNumber, contract, slot);
  }

  /**
   * Retrieve the databases view of the Block Header object.
   * This structure is fed into the circuits simulator and is used to prove against certain historical roots.
   *
   * @returns A Promise that resolves to a BlockHeader object.
   */
  getBlockHeader(): Promise<BlockHeader> {
    return this.syncDataProvider.getBlockHeader();
  }

  /**
   * Fetches the current block number.
   * @returns The block number.
   */
  public async getBlockNumber(): Promise<number> {
    return await this.aztecNode.getBlockNumber();
  }

  /**
   * Fetches the current chain id.
   * @returns The chain id.
   */
  public async getChainId(): Promise<number> {
    return await this.aztecNode.getChainId();
  }

  /**
   * Fetches the current version.
   * @returns The version.
   */
  public async getVersion(): Promise<number> {
    return await this.aztecNode.getVersion();
  }

  public getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string> {
    return this.contractDataProvider.getDebugFunctionName(contractAddress, selector);
  }

  /**
   * Returns the full contents of your address book.
   * This is used when calculating tags for incoming notes by deriving the shared secret, the contract-siloed tagging secret, and
   * finally the index specified tag. We will then query the node with this tag for each address in the address book.
   * @returns The full list of the users contact addresses.
   */
  public getSenders(): Promise<AztecAddress[]> {
    return this.taggingDataProvider.getSenderAddresses();
  }

  /**
   * Returns the tagging secret for a given sender and recipient pair. For this to work, the ivsk_m of the sender must be known.
   * Includes the next index to be used used for tagging with this secret.
   * @param contractAddress - The contract address to silo the secret for
   * @param sender - The address sending the note
   * @param recipient - The address receiving the note
   * @returns An indexed tagging secret that can be used to tag notes.
   */
  public async getIndexedTaggingSecretAsSender(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret> {
    await this.syncTaggedLogsAsSender(contractAddress, sender, recipient);

    const appTaggingSecret = await this.#calculateAppTaggingSecret(contractAddress, sender, recipient);
    const [index] = await this.taggingDataProvider.getTaggingSecretsIndexesAsSender([appTaggingSecret], sender);

    return new IndexedTaggingSecret(appTaggingSecret, index);
  }

  /**
   * Increments the tagging secret for a given sender and recipient pair. For this to work, the ivsk_m of the sender must be known.
   * @param contractAddress - The contract address to silo the secret for
   * @param sender - The address sending the note
   * @param recipient - The address receiving the note
   */
  public async incrementAppTaggingSecretIndexAsSender(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<void> {
    const secret = await this.#calculateAppTaggingSecret(contractAddress, sender, recipient);
    const contractName = await this.contractDataProvider.getDebugContractName(contractAddress);
    this.log.debug(`Incrementing app tagging secret at ${contractName}(${contractAddress})`, {
      secret,
      sender,
      recipient,
      contractName,
      contractAddress,
    });

    const [index] = await this.taggingDataProvider.getTaggingSecretsIndexesAsSender([secret], sender);
    await this.taggingDataProvider.setTaggingSecretsIndexesAsSender(
      [new IndexedTaggingSecret(secret, index + 1)],
      sender,
    );
  }

  async #calculateAppTaggingSecret(contractAddress: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
    const senderCompleteAddress = await this.getCompleteAddress(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    return computeAppTaggingSecret(senderCompleteAddress, senderIvsk, recipient, contractAddress);
  }

  /**
   * Returns the indexed tagging secrets for a given recipient and all the senders in the address book
   * This method should be exposed as an oracle call to allow aztec.nr to perform the orchestration
   * of the syncTaggedLogs and processTaggedLogs methods. However, it is not possible to do so at the moment,
   * so we're keeping it private for now.
   * @param contractAddress - The contract address to silo the secret for
   * @param recipient - The address receiving the notes
   * @returns A list of indexed tagging secrets
   */
  async #getIndexedTaggingSecretsForSenders(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret[]> {
    const recipientCompleteAddress = await this.getCompleteAddress(recipient);
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);

    // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
    // (recipient = us, sender = us)
    const senders = [
      ...(await this.taggingDataProvider.getSenderAddresses()),
      ...(await this.keyStore.getAccounts()),
    ].filter((address, index, self) => index === self.findIndex(otherAddress => otherAddress.equals(address)));
    const appTaggingSecrets = await Promise.all(
      senders.map(contact =>
        computeAppTaggingSecret(recipientCompleteAddress, recipientIvsk, contact, contractAddress),
      ),
    );
    const indexes = await this.taggingDataProvider.getTaggingSecretsIndexesAsRecipient(appTaggingSecrets, recipient);
    return appTaggingSecrets.map((secret, i) => new IndexedTaggingSecret(secret, indexes[i]));
  }

  /**
   * Updates the local index of the shared tagging secret of a sender / recipient pair
   * if a log with a larger index is found from the node.
   * @param contractAddress - The address of the contract that the logs are tagged for
   * @param sender - The address of the sender, we must know the sender's ivsk_m.
   * @param recipient - The address of the recipient.
   */
  public async syncTaggedLogsAsSender(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<void> {
    const appTaggingSecret = await this.#calculateAppTaggingSecret(contractAddress, sender, recipient);
    const [oldIndex] = await this.taggingDataProvider.getTaggingSecretsIndexesAsSender([appTaggingSecret], sender);

    // This algorithm works such that:
    // 1. If we find minimum consecutive empty logs in a window of logs we set the index to the index of the last log
    // we found and quit.
    // 2. If we don't find minimum consecutive empty logs in a window of logs we slide the window to latest log index
    // and repeat the process.
    const MIN_CONSECUTIVE_EMPTY_LOGS = 10;
    const WINDOW_SIZE = MIN_CONSECUTIVE_EMPTY_LOGS * 2;

    let [numConsecutiveEmptyLogs, currentIndex] = [0, oldIndex];
    do {
      // We compute the tags for the current window of indexes
      const currentTags = await timesParallel(WINDOW_SIZE, i => {
        const indexedAppTaggingSecret = new IndexedTaggingSecret(appTaggingSecret, currentIndex + i);
        return indexedAppTaggingSecret.computeSiloedTag(recipient, contractAddress);
      });

      // We fetch the logs for the tags
      const possibleLogs = await this.#getPrivateLogsByTags(currentTags);

      // We find the index of the last log in the window that is not empty
      const indexOfLastLog = possibleLogs.findLastIndex(possibleLog => possibleLog.length !== 0);

      if (indexOfLastLog === -1) {
        // We haven't found any logs in the current window so we stop looking
        break;
      }

      // We move the current index to that of the last log we found
      currentIndex += indexOfLastLog + 1;

      // We compute the number of consecutive empty logs we found and repeat the process if we haven't found enough.
      numConsecutiveEmptyLogs = WINDOW_SIZE - indexOfLastLog - 1;
    } while (numConsecutiveEmptyLogs < MIN_CONSECUTIVE_EMPTY_LOGS);

    const contractName = await this.contractDataProvider.getDebugContractName(contractAddress);
    if (currentIndex !== oldIndex) {
      await this.taggingDataProvider.setTaggingSecretsIndexesAsSender(
        [new IndexedTaggingSecret(appTaggingSecret, currentIndex)],
        sender,
      );

      this.log.debug(`Syncing logs for sender ${sender} at contract ${contractName}(${contractAddress})`, {
        sender,
        secret: appTaggingSecret,
        index: currentIndex,
        contractName,
        contractAddress,
      });
    } else {
      this.log.debug(`No new logs found for sender ${sender} at contract ${contractName}(${contractAddress})`);
    }
  }

  /**
   * Synchronizes the private logs tagged with scoped addresses and all the senders in the address book. Stores the found
   * logs in CapsuleArray ready for a later retrieval in Aztec.nr.
   * @param contractAddress - The address of the contract that the logs are tagged for.
   * @param pendingTaggedLogArrayBaseSlot - The base slot of the pending tagged logs capsule array in which
   * found logs will be stored.
   * @param scopes - The scoped addresses to sync logs for. If not provided, all accounts in the address book will be
   * synced.
   */
  public async syncTaggedLogs(
    contractAddress: AztecAddress,
    pendingTaggedLogArrayBaseSlot: Fr,
    scopes?: AztecAddress[],
  ) {
    this.log.verbose('Searching for tagged logs', { contract: contractAddress });

    const maxBlockNumber = await this.syncDataProvider.getBlockNumber();

    // Ideally this algorithm would be implemented in noir, exposing its building blocks as oracles.
    // However it is impossible at the moment due to the language not supporting nested slices.
    // This nesting is necessary because for a given set of tags we don't
    // know how many logs we will get back. Furthermore, these logs are of undetermined
    // length, since we don't really know the note they correspond to until we decrypt them.

    const recipients = scopes ? scopes : await this.keyStore.getAccounts();
    const contractName = await this.contractDataProvider.getDebugContractName(contractAddress);
    for (const recipient of recipients) {
      // Get all the secrets for the recipient and sender pairs (#9365)
      const secrets = await this.#getIndexedTaggingSecretsForSenders(contractAddress, recipient);

      // We fetch logs for a window of indexes in a range:
      //    <latest_log_index - WINDOW_HALF_SIZE, latest_log_index + WINDOW_HALF_SIZE>.
      //
      // We use this window approach because it could happen that a sender might have messed up and inadvertently
      // incremented their index without us getting any logs (for example, in case of a revert). If we stopped looking
      // for logs the first time we don't receive any logs for a tag, we might never receive anything from that sender again.
      //    Also there's a possibility that we have advanced our index, but the sender has reused it, so we might have missed
      // some logs. For these reasons, we have to look both back and ahead of the stored index.
      let secretsAndWindows = secrets.map(secret => {
        return {
          appTaggingSecret: secret.appTaggingSecret,
          leftMostIndex: Math.max(0, secret.index - WINDOW_HALF_SIZE),
          rightMostIndex: secret.index + WINDOW_HALF_SIZE,
        };
      });

      // As we iterate we store the largest index we have seen for a given secret to later on store it in the db.
      const newLargestIndexMapToStore: { [k: string]: number } = {};

      // The initial/unmodified indexes of the secrets stored in a key-value map where key is the app tagging secret.
      const initialIndexesMap = getInitialIndexesMap(secrets);

      while (secretsAndWindows.length > 0) {
        const secretsForTheWholeWindow = getIndexedTaggingSecretsForTheWindow(secretsAndWindows);
        const tagsForTheWholeWindow = await Promise.all(
          secretsForTheWholeWindow.map(secret => secret.computeSiloedTag(recipient, contractAddress)),
        );

        // We store the new largest indexes we find in the iteration in the following map to later on construct
        // a new set of secrets and windows to fetch logs for.
        const newLargestIndexMapForIteration: { [k: string]: number } = {};

        // Fetch the private logs for the tags and iterate over them
        const logsByTags = await this.#getPrivateLogsByTags(tagsForTheWholeWindow);

        for (let logIndex = 0; logIndex < logsByTags.length; logIndex++) {
          const logsByTag = logsByTags[logIndex];
          if (logsByTag.length > 0) {
            // We filter out the logs that are newer than the historical block number of the tx currently being constructed
            const filteredLogsByBlockNumber = logsByTag.filter(l => l.blockNumber <= maxBlockNumber);

            // We store the logs in capsules (to later be obtained in Noir)
            await this.#storePendingTaggedLogs(
              contractAddress,
              pendingTaggedLogArrayBaseSlot,
              recipient,
              filteredLogsByBlockNumber,
            );

            // We retrieve the indexed tagging secret corresponding to the log as I need that to evaluate whether
            // a new largest index have been found.
            const secretCorrespondingToLog = secretsForTheWholeWindow[logIndex];
            const initialIndex = initialIndexesMap[secretCorrespondingToLog.appTaggingSecret.toString()];

            this.log.debug(`Found ${logsByTags.length} logs as recipient ${recipient}`, {
              recipient,
              secret: secretCorrespondingToLog.appTaggingSecret,
              contractName,
              contractAddress,
            });

            if (
              secretCorrespondingToLog.index >= initialIndex &&
              (newLargestIndexMapForIteration[secretCorrespondingToLog.appTaggingSecret.toString()] === undefined ||
                secretCorrespondingToLog.index >=
                  newLargestIndexMapForIteration[secretCorrespondingToLog.appTaggingSecret.toString()])
            ) {
              // We have found a new largest index so we store it for later processing (storing it in the db + fetching
              // the difference of the window sets of current and the next iteration)
              newLargestIndexMapForIteration[secretCorrespondingToLog.appTaggingSecret.toString()] =
                secretCorrespondingToLog.index + 1;

              this.log.debug(
                `Incrementing index to ${
                  secretCorrespondingToLog.index + 1
                } at contract ${contractName}(${contractAddress})`,
              );
            }
          }
        }

        // Now based on the new largest indexes we found, we will construct a new secrets and windows set to fetch logs
        // for. Note that it's very unlikely that a new log from the current window would appear between the iterations
        // so we fetch the logs only for the difference of the window sets.
        const newSecretsAndWindows = [];
        for (const [appTaggingSecret, newIndex] of Object.entries(newLargestIndexMapForIteration)) {
          const secret = secrets.find(secret => secret.appTaggingSecret.toString() === appTaggingSecret);
          if (secret) {
            newSecretsAndWindows.push({
              appTaggingSecret: secret.appTaggingSecret,
              // We set the left most index to the new index to avoid fetching the same logs again
              leftMostIndex: newIndex,
              rightMostIndex: newIndex + WINDOW_HALF_SIZE,
            });

            // We store the new largest index in the map to later store it in the db.
            newLargestIndexMapToStore[appTaggingSecret] = newIndex;
          } else {
            throw new Error(
              `Secret not found for appTaggingSecret ${appTaggingSecret}. This is a bug as it should never happen!`,
            );
          }
        }

        // Now we set the new secrets and windows and proceed to the next iteration.
        secretsAndWindows = newSecretsAndWindows;
      }

      // At this point we have processed all the logs for the recipient so we store the new largest indexes in the db.
      await this.taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        Object.entries(newLargestIndexMapToStore).map(
          ([appTaggingSecret, index]) => new IndexedTaggingSecret(Fr.fromHexString(appTaggingSecret), index),
        ),
        recipient,
      );
    }
  }

  async #storePendingTaggedLogs(
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

  public async validateEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
  ): Promise<void> {
    // We read all note and event validation requests and process them all concurrently. This makes the process much
    // faster as we don't need to wait for the network round-trip.
    const noteValidationRequests = (
      await this.capsuleDataProvider.readCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot)
    ).map(NoteValidationRequest.fromFields);

    const eventValidationRequests = (
      await this.capsuleDataProvider.readCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot)
    ).map(EventValidationRequest.fromFields);

    const noteDeliveries = noteValidationRequests.map(request =>
      this.deliverNote(
        request.contractAddress,
        request.storageSlot,
        request.noteNonce,
        request.content,
        request.noteHash,
        request.nullifier,
        request.txHash,
        request.recipient,
      ),
    );

    const eventDeliveries = eventValidationRequests.map(request =>
      this.deliverEvent(
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
    await this.capsuleDataProvider.resetCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, []);
    await this.capsuleDataProvider.resetCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, []);
  }

  async deliverNote(
    contractAddress: AztecAddress,
    storageSlot: Fr,
    noteNonce: Fr,
    content: Fr[],
    noteHash: Fr,
    nullifier: Fr,
    txHash: TxHash,
    recipient: AztecAddress,
  ): Promise<void> {
    // We are going to store the new note in the NoteDataProvider, which will let us later return it via `getNotes`.
    // There's two things we need to check before we do this however:
    //  - we must make sure the note does actually exist in the note hash tree
    //  - we need to check if the note has already been nullified
    //
    // Failing to do either of the above would result in circuits getting either non-existent notes and failing to
    // produce inclusion proofs for them, or getting nullified notes and producing duplicate nullifiers, both of which
    // are catastrophic failure modes.
    //
    // Note that adding a note and removing it is *not* equivalent to never adding it in the first place. A nullifier
    // emitted in a block that comes after note creation might result in the note being de-nullified by a chain reorg,
    // so we must store both the note hash and nullifier block information.

    // We avoid making node queries at 'latest' since we don't want to process notes or nullifiers that only exist ahead
    // in time of the locally synced state.
    // Note that while this technically results in historical queries, we perform it at the latest locally synced block
    // number which *should* be recent enough to be available, even for non-archive nodes.
    // Also note that the note should never be ahead of the synced block here since `fetchTaggedLogs` only processes
    // logs up to the synced block making this only an additional safety check.
    const syncedBlockNumber = await this.syncDataProvider.getBlockNumber();

    // By computing siloed and unique note hashes ourselves we prevent contracts from interfering with the note storage
    // of other contracts, which would constitute a security breach.
    const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
    const siloedNullifier = await siloNullifier(contractAddress, nullifier);

    // We store notes by their index in the global note hash tree, which has the convenient side effect of validating
    // note existence in said tree. We concurrently also check if the note's nullifier exists, performing all node
    // queries in a single round-trip.
    const [[uniqueNoteHashTreeIndexInBlock], [nullifierIndex]] = await Promise.all([
      this.aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NOTE_HASH_TREE, [uniqueNoteHash]),
      this.aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [siloedNullifier]),
    ]);

    if (uniqueNoteHashTreeIndexInBlock === undefined) {
      throw new Error(
        `Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present on the tree at block ${syncedBlockNumber} (from tx ${txHash})`,
      );
    }

    const noteDao = new NoteDao(
      new Note(content),
      contractAddress,
      storageSlot,
      noteNonce,
      noteHash,
      siloedNullifier,
      txHash,
      uniqueNoteHashTreeIndexInBlock?.l2BlockNumber,
      uniqueNoteHashTreeIndexInBlock?.l2BlockHash,
      uniqueNoteHashTreeIndexInBlock?.data,
      recipient,
    );

    await this.noteDataProvider.addNotes([noteDao], recipient);
    this.log.verbose('Added note', {
      index: noteDao.index,
      contract: noteDao.contractAddress.toString(),
      slot: noteDao.storageSlot.toString(),
      noteHash: noteDao.noteHash.toString(),
      nullifier: noteDao.siloedNullifier.toString(),
    });

    if (nullifierIndex !== undefined) {
      const { data: _, ...blockHashAndNum } = nullifierIndex;
      await this.noteDataProvider.removeNullifiedNotes([{ data: siloedNullifier, ...blockHashAndNum }], recipient);

      this.log.verbose(`Removed just-added note`, {
        contract: contractAddress,
        slot: storageSlot,
        noteHash: noteHash,
        nullifier: siloedNullifier.toString(),
      });
    }
  }

  async deliverEvent(
    contractAddress: AztecAddress,
    selector: EventSelector,
    content: Fr[],
    eventCommitment: Fr,
    txHash: TxHash,
    recipient: AztecAddress,
  ): Promise<void> {
    // While using 'latest' block number would be fine for private events since they cannot be accessed from Aztec.nr
    // (and thus we're less concerned about being ahead of the synced block), we use the synced block number to
    // maintain consistent behavior in the PXE. Additionally, events should never be ahead of the synced block here
    // since `fetchTaggedLogs` only processes logs up to the synced block.
    const syncedBlockNumber = await this.syncDataProvider.getBlockNumber();

    const siloedEventCommitment = await siloNullifier(contractAddress, eventCommitment);

    const [nullifierIndex] = await this.aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [
      siloedEventCommitment,
    ]);

    if (nullifierIndex === undefined) {
      throw new Error(
        `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present on the nullifier tree at block ${syncedBlockNumber} (from tx ${txHash})`,
      );
    }

    return this.privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      selector,
      content,
      txHash,
      Number(nullifierIndex.data), // Index of the event commitment in the nullifier tree
      nullifierIndex.l2BlockNumber, // Block in which the event was emitted
    );
  }

  public async getPublicLogByTag(tag: Fr, contractAddress: AztecAddress): Promise<PublicLogWithTxData | null> {
    const logs = await this.#getPublicLogsByTagsFromContract([tag], contractAddress);
    const logsForTag = logs[0];

    this.log.debug(`Got ${logsForTag.length} public logs for tag ${tag}`);

    if (logsForTag.length == 0) {
      return null;
    } else if (logsForTag.length > 1) {
      // TODO(#11627): handle this case
      throw new Error(
        `Got ${logsForTag.length} logs for tag ${tag} and contract ${contractAddress.toString()}. getPublicLogByTag currently only supports a single log per tag`,
      );
    }

    const scopedLog = logsForTag[0];

    // getLogsByTag doesn't have all of the information that we need (notably note hashes and the first nullifier), so
    // we need to make a second call to the node for `getTxEffect`.
    // TODO(#9789): bundle this information in the `getLogsByTag` call.
    const txEffect = await this.aztecNode.getTxEffect(scopedLog.txHash);
    if (txEffect == undefined) {
      throw new Error(`Unexpected: failed to retrieve tx effects for tx ${scopedLog.txHash} which is known to exist`);
    }

    return new PublicLogWithTxData(
      scopedLog.log.getEmittedFieldsWithoutTag(),
      scopedLog.txHash,
      txEffect.data.noteHashes,
      txEffect.data.nullifiers[0],
    );
  }

  public async getPrivateLogByTag(siloedTag: Fr): Promise<PrivateLogWithTxData | null> {
    const logs = await this.#getPrivateLogsByTags([siloedTag]);
    const logsForTag = logs[0];

    this.log.debug(`Got ${logsForTag.length} private logs for tag ${siloedTag}`);

    if (logsForTag.length == 0) {
      return null;
    } else if (logsForTag.length > 1) {
      // TODO(#11627): handle this case
      throw new Error(
        `Got ${logsForTag.length} logs for tag ${siloedTag}. getPrivateLogByTag currently only supports a single log per tag`,
      );
    }

    const scopedLog = logsForTag[0];

    // getLogsByTag doesn't have all of the information that we need (notably note hashes and the first nullifier), so
    // we need to make a second call to the node for `getTxEffect`.
    // TODO(#9789): bundle this information in the `getLogsByTag` call.
    const txEffect = await this.aztecNode.getTxEffect(scopedLog.txHash);
    if (txEffect == undefined) {
      throw new Error(`Unexpected: failed to retrieve tx effects for tx ${scopedLog.txHash} which is known to exist`);
    }

    return new PrivateLogWithTxData(
      scopedLog.log.getEmittedFieldsWithoutTag(),
      scopedLog.txHash,
      txEffect.data.noteHashes,
      txEffect.data.nullifiers[0],
    );
  }

  public async removeNullifiedNotes(contractAddress: AztecAddress) {
    this.log.verbose('Searching for nullifiers of known notes', { contract: contractAddress });

    // We avoid making node queries at 'latest' since we mark notes as nullified only if the corresponding nullifier
    // has been included in a block up to which PXE has synced. Note that while this technically results in historical
    // queries, we perform it at the latest locally synced block number which *should* be recent enough to be
    // available, even for non-archive nodes.
    const syncedBlockNumber = await this.syncDataProvider.getBlockNumber();

    for (const recipient of await this.keyStore.getAccounts()) {
      const currentNotesForRecipient = await this.noteDataProvider.getNotes({ contractAddress, recipient });

      if (currentNotesForRecipient.length === 0) {
        // Save a call to the node if there are no notes for the recipient
        continue;
      }

      const nullifiersToCheck = currentNotesForRecipient.map(note => note.siloedNullifier);
      const nullifierIndexes = await this.aztecNode.findLeavesIndexes(
        syncedBlockNumber,
        MerkleTreeId.NULLIFIER_TREE,
        nullifiersToCheck,
      );

      const foundNullifiers = nullifiersToCheck
        .map((nullifier, i) => {
          if (nullifierIndexes[i] !== undefined) {
            return { ...nullifierIndexes[i], ...{ data: nullifier } } as InBlock<Fr>;
          }
        })
        .filter(nullifier => nullifier !== undefined) as InBlock<Fr>[];

      const nullifiedNotes = await this.noteDataProvider.removeNullifiedNotes(foundNullifiers, recipient);
      nullifiedNotes.forEach(noteDao => {
        this.log.verbose(`Removed note for contract ${noteDao.contractAddress} at slot ${noteDao.storageSlot}`, {
          contract: noteDao.contractAddress,
          slot: noteDao.storageSlot,
          nullifier: noteDao.siloedNullifier.toString(),
        });
      });
    }
  }

  storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    return this.capsuleDataProvider.storeCapsule(contractAddress, slot, capsule);
  }

  loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    return this.capsuleDataProvider.loadCapsule(contractAddress, slot);
  }

  deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    return this.capsuleDataProvider.deleteCapsule(contractAddress, slot);
  }

  copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
    return this.capsuleDataProvider.copyCapsule(contractAddress, srcSlot, dstSlot, numEntries);
  }

  async getSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    // TODO(#12656): return an app-siloed secret
    const recipientCompleteAddress = await this.getCompleteAddress(address);
    const ivskM = await this.keyStore.getMasterSecretKey(
      recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey,
    );
    const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
    return deriveEcdhSharedSecret(addressSecret, ephPk);
  }

  // TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
  // was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
  async #getPrivateLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    const allLogs = await this.aztecNode.getLogsByTags(tags);
    return allLogs.map(logs => logs.filter(log => !log.isFromPublic));
  }

  // TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
  // was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
  async #getPublicLogsByTagsFromContract(tags: Fr[], contractAddress: AztecAddress): Promise<TxScopedL2Log[][]> {
    const allLogs = await this.aztecNode.getLogsByTags(tags);
    const allPublicLogs = allLogs.map(logs => logs.filter(log => log.isFromPublic));
    return allPublicLogs.map(logs =>
      logs.filter(log => (log.log as PublicLog).contractAddress.equals(contractAddress)),
    );
  }

  getStats(): ExecutionStats {
    const nodeRPCCalls =
      typeof (this.aztecNode as ProxiedNode).getStats === 'function' ? (this.aztecNode as ProxiedNode).getStats() : {};

    return { nodeRPCCalls };
  }
}
