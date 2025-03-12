import {
  type L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NOTE_HASHES_PER_TX,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  PUBLIC_LOG_DATA_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import type { KeyStore } from '@aztec/key-store';
import { AcirSimulator, type ExecutionDataProvider, type SimulationProvider } from '@aztec/simulator/client';
import { MessageLoadOracleInputs } from '@aztec/simulator/client';
import {
  type FunctionArtifact,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  NoteSelector,
  encodeArguments,
  getFunctionArtifact,
} from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock, L2Block, L2BlockNumber } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { computeAddressSecret, computeTaggingSecretPoint } from '@aztec/stdlib/keys';
import {
  IndexedTaggingSecret,
  L1NotePayload,
  LogWithTxData,
  PrivateLog,
  PublicLog,
  TxScopedL2Log,
} from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import { Note, type NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';
import { TxHash } from '@aztec/stdlib/tx';

import { getOrderedNoteItems } from '../note_decryption_utils/add_public_values_to_payload.js';
import type { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import type { AuthWitnessDataProvider } from '../storage/auth_witness_data_provider/auth_witness_data_provider.js';
import type { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import type { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';
import { NoteDao } from '../storage/note_data_provider/note_dao.js';
import type { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import type { SyncDataProvider } from '../storage/sync_data_provider/sync_data_provider.js';
import type { TaggingDataProvider } from '../storage/tagging_data_provider/tagging_data_provider.js';
import { WINDOW_HALF_SIZE, getIndexedTaggingSecretsForTheWindow, getInitialIndexesMap } from './tagging_utils.js';

/**
 * A data layer that provides and stores information needed for simulating/proving a transaction.
 */
export class PXEOracleInterface implements ExecutionDataProvider {
  constructor(
    private aztecNode: AztecNode,
    private keyStore: KeyStore,
    private simulationProvider: SimulationProvider,
    private contractDataProvider: ContractDataProvider,
    private noteDataProvider: NoteDataProvider,
    private capsuleDataProvider: CapsuleDataProvider,
    private syncDataProvider: SyncDataProvider,
    private taggingDataProvider: TaggingDataProvider,
    private addressDataProvider: AddressDataProvider,
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
    return noteDaos.map(({ contractAddress, storageSlot, nonce, note, noteHash, siloedNullifier, index }) => ({
      contractAddress,
      storageSlot,
      nonce,
      note,
      noteHash,
      siloedNullifier,
      // PXE can use this index to get full MembershipWitness
      index,
    }));
  }

  async getFunctionArtifact(contractAddress: AztecAddress, selector: FunctionSelector): Promise<FunctionArtifact> {
    const artifact = await this.contractDataProvider.getFunctionArtifact(contractAddress, selector);
    const debug = await this.contractDataProvider.getFunctionDebugMetadata(contractAddress, selector);
    return {
      ...artifact,
      debug,
    };
  }

  async getFunctionArtifactByName(
    contractAddress: AztecAddress,
    functionName: string,
  ): Promise<FunctionArtifact | undefined> {
    const instance = await this.contractDataProvider.getContractInstance(contractAddress);
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

  // Only used in public.
  public getL1ToL2LeafValue(_leafIndex: bigint): Promise<Fr | undefined> {
    throw new Error('Unimplemented in private!');
  }

  /**
   * Gets the index of a commitment in the note hash tree.
   * @param commitment - The commitment.
   * @returns - The index of the commitment. Undefined if it does not exist in the tree.
   */
  async getCommitmentIndex(commitment: Fr) {
    return await this.#findLeafIndex('latest', MerkleTreeId.NOTE_HASH_TREE, commitment);
  }

  // We need this in public as part of the EXISTS calls - but isn't used in private
  public getCommitmentValue(_leafIndex: bigint): Promise<Fr | undefined> {
    throw new Error('Unimplemented in private!');
  }

  async getNullifierIndex(nullifier: Fr) {
    return await this.#findLeafIndex('latest', MerkleTreeId.NULLIFIER_TREE, nullifier);
  }

  async #findLeafIndex(blockNumber: L2BlockNumber, treeId: MerkleTreeId, leafValue: Fr): Promise<bigint | undefined> {
    const [leafIndex] = await this.aztecNode.findLeavesIndexes(blockNumber, treeId, [leafValue]);
    return leafIndex;
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

  public async getPublicDataTreeWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return await this.aztecNode.getPublicDataTreeWitness(blockNumber, leafSlot);
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
    const [index] = await this.taggingDataProvider.getTaggingSecretsIndexesAsSender([appTaggingSecret]);

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

    const [index] = await this.taggingDataProvider.getTaggingSecretsIndexesAsSender([secret]);
    await this.taggingDataProvider.setTaggingSecretsIndexesAsSender([new IndexedTaggingSecret(secret, index + 1)]);
  }

  async #calculateAppTaggingSecret(contractAddress: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
    const senderCompleteAddress = await this.getCompleteAddress(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    const secretPoint = await computeTaggingSecretPoint(senderCompleteAddress, senderIvsk, recipient);
    // Silo the secret so it can't be used to track other app's notes
    const appSecret = poseidon2Hash([secretPoint.x, secretPoint.y, contractAddress]);
    return appSecret;
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
      senders.map(async contact => {
        const sharedSecret = await computeTaggingSecretPoint(recipientCompleteAddress, recipientIvsk, contact);
        return poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
      }),
    );
    const indexes = await this.taggingDataProvider.getTaggingSecretsIndexesAsRecipient(appTaggingSecrets);
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
    const [oldIndex] = await this.taggingDataProvider.getTaggingSecretsIndexesAsSender([appTaggingSecret]);

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
      const possibleLogs = await this.aztecNode.getLogsByTags(currentTags);

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
      await this.taggingDataProvider.setTaggingSecretsIndexesAsSender([
        new IndexedTaggingSecret(appTaggingSecret, currentIndex),
      ]);

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
   * Synchronizes the logs tagged with scoped addresses and all the senders in the address book.
   * Returns the unsynched logs and updates the indexes of the secrets used to tag them until there are no more logs
   * to sync.
   * @param contractAddress - The address of the contract that the logs are tagged for
   * @param recipient - The address of the recipient
   * @returns A list of encrypted logs tagged with the recipient's address
   */
  public async syncTaggedLogs(
    contractAddress: AztecAddress,
    maxBlockNumber: number,
    scopes?: AztecAddress[],
  ): Promise<Map<string, TxScopedL2Log[]>> {
    this.log.verbose('Searching for tagged logs', { contract: contractAddress });

    // Ideally this algorithm would be implemented in noir, exposing its building blocks as oracles.
    // However it is impossible at the moment due to the language not supporting nested slices.
    // This nesting is necessary because for a given set of tags we don't
    // know how many logs we will get back. Furthermore, these logs are of undetermined
    // length, since we don't really know the note they correspond to until we decrypt them.

    const recipients = scopes ? scopes : await this.keyStore.getAccounts();
    // A map of logs going from recipient address to logs. Note that the logs might have been processed before
    // due to us having a sliding window that "looks back" for logs as well. (We look back as there is no guarantee
    // that a logs will be received ordered by a given tax index and that the tags won't be reused).
    const logsMap = new Map<string, TxScopedL2Log[]>();
    const contractName = await this.contractDataProvider.getDebugContractName(contractAddress);
    for (const recipient of recipients) {
      const logsForRecipient: TxScopedL2Log[] = [];

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

        // Fetch the logs for the tags and iterate over them
        const logsByTags = await this.aztecNode.getLogsByTags(tagsForTheWholeWindow);

        logsByTags.forEach((logsByTag, logIndex) => {
          if (logsByTag.length > 0) {
            // Check that public logs have the correct contract address
            const checkedLogsbyTag = logsByTag.filter(
              l => !l.isFromPublic || PublicLog.fromBuffer(l.logData).contractAddress.equals(contractAddress),
            );
            if (checkedLogsbyTag.length < logsByTag.length) {
              const discarded = logsByTag.filter(
                log => checkedLogsbyTag.find(filteredLog => filteredLog.equals(log)) === undefined,
              );
              this.log.warn(
                `Discarded ${
                  logsByTag.length - checkedLogsbyTag.length
                } public logs with mismatched contract address ${contractAddress}:`,
                discarded.map(l => PublicLog.fromBuffer(l.logData)),
              );
            }

            // The logs for the given tag exist so we store them for later processing
            logsForRecipient.push(...checkedLogsbyTag);

            // We retrieve the indexed tagging secret corresponding to the log as I need that to evaluate whether
            // a new largest index have been found.
            const secretCorrespondingToLog = secretsForTheWholeWindow[logIndex];
            const initialIndex = initialIndexesMap[secretCorrespondingToLog.appTaggingSecret.toString()];

            this.log.debug(`Found ${checkedLogsbyTag.length} logs as recipient ${recipient}`, {
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
        });

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

      // We filter the logs by block number and store them in the map.
      logsMap.set(
        recipient.toString(),
        logsForRecipient.filter(log => log.blockNumber <= maxBlockNumber),
      );

      // At this point we have processed all the logs for the recipient so we store the new largest indexes in the db.
      await this.taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        Object.entries(newLargestIndexMapToStore).map(
          ([appTaggingSecret, index]) => new IndexedTaggingSecret(Fr.fromHexString(appTaggingSecret), index),
        ),
      );
    }
    return logsMap;
  }

  /**
   * Decrypts logs tagged for a recipient and returns them.
   * @param scopedLogs - The logs to decrypt.
   * @param recipient - The recipient of the logs.
   * @returns The decrypted notes.
   */
  async #decryptTaggedLogs(scopedLogs: TxScopedL2Log[], recipient: AztecAddress) {
    const recipientCompleteAddress = await this.getCompleteAddress(recipient);
    const ivskM = await this.keyStore.getMasterSecretKey(
      recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey,
    );
    const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);

    // Since we could have notes with the same index for different txs, we need
    // to keep track of them scoping by txHash
    const excludedIndices: Map<string, Set<number>> = new Map();
    const decrypted = [];

    for (const scopedLog of scopedLogs) {
      const payload = scopedLog.isFromPublic
        ? await L1NotePayload.decryptAsIncomingFromPublic(PublicLog.fromBuffer(scopedLog.logData), addressSecret)
        : await L1NotePayload.decryptAsIncoming(PrivateLog.fromBuffer(scopedLog.logData), addressSecret);

      if (!payload) {
        this.log.verbose('Unable to decrypt log');
        continue;
      }

      if (!excludedIndices.has(scopedLog.txHash.toString())) {
        excludedIndices.set(scopedLog.txHash.toString(), new Set());
      }

      const note = await getOrderedNoteItems(this.contractDataProvider, payload);
      const plaintext = [payload.storageSlot, payload.noteTypeId.toField(), ...note.items];

      decrypted.push({ plaintext, txHash: scopedLog.txHash, contractAddress: payload.contractAddress });
    }

    return decrypted;
  }

  /**
   * Processes the tagged logs returned by syncTaggedLogs by decrypting them and storing them in the database.
   * @param logs - The logs to process.
   * @param recipient - The recipient of the logs.
   */
  public async processTaggedLogs(
    logs: TxScopedL2Log[],
    recipient: AztecAddress,
    simulator?: AcirSimulator,
  ): Promise<void> {
    const decryptedLogs = await this.#decryptTaggedLogs(logs, recipient);

    // We've produced the full NoteDao, which we'd be able to simply insert into the database. However, this is
    // only a temporary measure as we migrate from the PXE-driven discovery into the new contract-driven approach. We
    // discard most of the work done up to this point and reconstruct the note plaintext to then hand over to the
    // contract for further processing.
    for (const decryptedLog of decryptedLogs) {
      // Log processing requires the note hashes in the tx in which the note was created. We are now assuming that the
      // note was included in the same block in which the log was delivered - note that partial notes will not work this
      // way.
      const txEffect = await this.aztecNode.getTxEffect(decryptedLog.txHash);
      if (!txEffect) {
        throw new Error(`Could not find tx effect for tx hash ${decryptedLog.txHash}`);
      }

      // This will trigger calls to the deliverNote oracle
      await this.callProcessLog(
        decryptedLog.contractAddress,
        decryptedLog.plaintext,
        decryptedLog.txHash,
        txEffect.data.noteHashes,
        txEffect.data.nullifiers[0],
        recipient,
        simulator,
      );
    }
    return;
  }

  public async deliverNote(
    contractAddress: AztecAddress,
    storageSlot: Fr,
    nonce: Fr,
    content: Fr[],
    noteHash: Fr,
    nullifier: Fr,
    txHash: Fr,
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
    const syncedBlockNumber = (await this.syncDataProvider.getBlockNumber())!;
    if (syncedBlockNumber === undefined) {
      throw new Error(`Attempted to deliver a note with an unsynchronized PXE - this should never happen`);
    }

    // By computing siloed and unique note hashes ourselves we prevent contracts from interfering with the note storage
    // of other contracts, which would constitute a security breach.
    const uniqueNoteHash = await computeUniqueNoteHash(nonce, await siloNoteHash(contractAddress, noteHash));
    const siloedNullifier = await siloNullifier(contractAddress, nullifier);

    // We store notes by their index in the global note hash tree, which has the convenient side effect of validating
    // note existence in said tree.
    const [uniqueNoteHashTreeIndex] = await this.aztecNode.findLeavesIndexes(
      syncedBlockNumber,
      MerkleTreeId.NOTE_HASH_TREE,
      [uniqueNoteHash],
    );
    if (uniqueNoteHashTreeIndex === undefined) {
      throw new Error(
        `Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present on the tree at block ${syncedBlockNumber} (from tx ${txHash})`,
      );
    }

    // TODO (#12550): findLeavesIndexes should probably return an InBlock, same as findNullifiersIndexesWithBlock. This
    // would save us from having to then query the tx receipt in order to get the block hash and number. Note regardless
    // that we're not validating that the note was indeed created in this tx (which would require inspecting the tx
    // effects), so maybe what we really want is an InTx.
    const txReceipt = await this.aztecNode.getTxReceipt(new TxHash(txHash));
    if (txReceipt === undefined) {
      throw new Error(`Failed to fetch tx receipt for tx hash ${txHash} when searching for note hashes`);
    }

    // TODO(#12549): does it make sense to store the recipient's address point instead of just its address?
    const recipientAddressPoint = await recipient.toAddressPoint();
    const noteDao = new NoteDao(
      new Note(content),
      contractAddress,
      storageSlot,
      nonce,
      noteHash,
      siloedNullifier,
      new TxHash(txHash),
      txReceipt.blockNumber!,
      txReceipt.blockHash!.toString(),
      uniqueNoteHashTreeIndex,
      recipientAddressPoint,
      NoteSelector.empty(), // TODO(#12013): remove
    );

    await this.noteDataProvider.addNotes([noteDao], recipient);
    this.log.verbose('Added note', {
      contract: noteDao.contractAddress,
      slot: noteDao.storageSlot,
      noteHash: noteDao.noteHash,
      nullifier: noteDao.siloedNullifier.toString(),
    });

    const [nullifierIndex] = await this.aztecNode.findNullifiersIndexesWithBlock(syncedBlockNumber, [siloedNullifier]);
    if (nullifierIndex !== undefined) {
      const { data: _, ...blockHashAndNum } = nullifierIndex;
      await this.noteDataProvider.removeNullifiedNotes(
        [{ data: siloedNullifier, ...blockHashAndNum }],
        recipientAddressPoint,
      );

      this.log.verbose(`Removed just-added note`, {
        contract: contractAddress,
        slot: storageSlot,
        noteHash: noteHash,
        nullifier: siloedNullifier.toString(),
      });
    }
  }

  public async getLogByTag(tag: Fr): Promise<LogWithTxData | null> {
    const logs = await this.aztecNode.getLogsByTags([tag]);
    const logsForTag = logs[0];

    this.log.debug(`Got ${logsForTag.length} logs for tag ${tag}`);

    if (logsForTag.length == 0) {
      return null;
    } else if (logsForTag.length > 1) {
      // TODO(#11627): handle this case
      throw new Error(
        `Got ${logsForTag.length} logs for tag ${tag}. getLogByTag currently only supports a single log per tag`,
      );
    }

    const log = logsForTag[0];

    // getLogsByTag doesn't have all of the information that we need (notably note hashes and the first nullifier), so
    // we need to make a second call to the node for `getTxEffect`.
    // TODO(#9789): bundle this information in the `getLogsByTag` call.
    const txEffect = await this.aztecNode.getTxEffect(log.txHash);
    if (txEffect == undefined) {
      throw new Error(`Unexpected: failed to retrieve tx effects for tx ${log.txHash} which is known to exist`);
    }

    const reader = BufferReader.asReader(log.logData);
    const logArray = reader.readArray(PUBLIC_LOG_DATA_SIZE_IN_FIELDS, Fr);

    // Public logs always take up all available fields by padding with zeroes, and the length of the originally emitted
    // log is lost. Until this is improved, we simply remove all of the zero elements (which are expected to be at the
    // end).
    // TODO(#11636): use the actual log length.
    const trimmedLog = logArray.filter(x => !x.isZero());

    return new LogWithTxData(trimmedLog, log.txHash.hash, txEffect.data.noteHashes, txEffect.data.nullifiers[0]);
  }

  public async removeNullifiedNotes(contractAddress: AztecAddress) {
    this.log.verbose('Searching for nullifiers of known notes', { contract: contractAddress });

    for (const recipient of await this.keyStore.getAccounts()) {
      const currentNotesForRecipient = await this.noteDataProvider.getNotes({ contractAddress, owner: recipient });
      const nullifiersToCheck = currentNotesForRecipient.map(note => note.siloedNullifier);
      const nullifierIndexes = await this.aztecNode.findNullifiersIndexesWithBlock('latest', nullifiersToCheck);

      const foundNullifiers = nullifiersToCheck
        .map((nullifier, i) => {
          if (nullifierIndexes[i] !== undefined) {
            return { ...nullifierIndexes[i], ...{ data: nullifier } } as InBlock<Fr>;
          }
        })
        .filter(nullifier => nullifier !== undefined) as InBlock<Fr>[];

      const nullifiedNotes = await this.noteDataProvider.removeNullifiedNotes(
        foundNullifiers,
        await recipient.toAddressPoint(),
      );
      nullifiedNotes.forEach(noteDao => {
        this.log.verbose(`Removed note for contract ${noteDao.contractAddress} at slot ${noteDao.storageSlot}`, {
          contract: noteDao.contractAddress,
          slot: noteDao.storageSlot,
          nullifier: noteDao.siloedNullifier.toString(),
        });
      });
    }
  }

  async callProcessLog(
    contractAddress: AztecAddress,
    logPlaintext: Fr[],
    txHash: TxHash,
    noteHashes: Fr[],
    firstNullifier: Fr,
    recipient: AztecAddress,
    simulator?: AcirSimulator,
  ) {
    const artifact: FunctionArtifact | undefined = await this.contractDataProvider.getFunctionArtifactByName(
      contractAddress,
      'process_log',
    );
    if (!artifact) {
      throw new Error(
        `Mandatory implementation of "process_log" missing in noir contract ${contractAddress.toString()}.`,
      );
    }

    const selector = await FunctionSelector.fromNameAndParameters(artifact);
    const execRequest: FunctionCall = {
      name: artifact.name,
      to: contractAddress,
      selector,
      type: FunctionType.UNCONSTRAINED,
      isStatic: artifact.isStatic,
      args: encodeArguments(artifact, [
        toBoundedVec(logPlaintext, PRIVATE_LOG_SIZE_IN_FIELDS),
        txHash.toString(),
        toBoundedVec(noteHashes, MAX_NOTE_HASHES_PER_TX),
        firstNullifier,
        recipient,
      ]),
      returnTypes: artifact.returnTypes,
    };

    await (simulator ?? new AcirSimulator(this, this.simulationProvider)).runUnconstrained(
      execRequest,
      contractAddress,
      selector,
      [], // empty scope as this call should not require access to private information
    );
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
}

function toBoundedVec(array: Fr[], maxLength: number) {
  return { storage: array.concat(Array(maxLength - array.length).fill(new Fr(0))), len: array.length };
}
