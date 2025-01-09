import {
  type AztecNode,
  type InBlock,
  L1NotePayload,
  type L2Block,
  type L2BlockNumber,
  MerkleTreeId,
  type NoteStatus,
  type NullifierMembershipWitness,
  type PublicDataWitness,
  type TxEffect,
  type TxScopedL2Log,
  getNonNullifiedL1ToL2MessageWitness,
} from '@aztec/circuit-types';
import {
  type AztecAddress,
  type BlockHeader,
  type CompleteAddress,
  type ContractInstance,
  Fr,
  type FunctionSelector,
  IndexedTaggingSecret,
  type KeyValidationRequest,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  PrivateLog,
  computeAddressSecret,
  computeTaggingSecretPoint,
} from '@aztec/circuits.js';
import { type FunctionArtifact, getFunctionArtifact } from '@aztec/foundation/abi';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { type KeyStore } from '@aztec/key-store';
import { MessageLoadOracleInputs } from '@aztec/simulator/acvm';
import { type AcirSimulator, type DBOracle } from '@aztec/simulator/client';

import { type ContractDataOracle } from '../contract_data_oracle/index.js';
import { type PxeDatabase } from '../database/index.js';
import { type NoteDao } from '../database/note_dao.js';
import { produceNoteDaos } from '../note_decryption_utils/produce_note_daos.js';
import { getAcirSimulator } from '../simulator/index.js';
import { WINDOW_HALF_SIZE, getIndexedTaggingSecretsForTheWindow, getInitialIndexesMap } from './tagging_utils.js';

/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class SimulatorOracle implements DBOracle {
  constructor(
    private contractDataOracle: ContractDataOracle,
    private db: PxeDatabase,
    private keyStore: KeyStore,
    private aztecNode: AztecNode,
    private log = createLogger('pxe:simulator_oracle'),
  ) {}

  getKeyValidationRequest(pkMHash: Fr, contractAddress: AztecAddress): Promise<KeyValidationRequest> {
    return this.keyStore.getKeyValidationRequest(pkMHash, contractAddress);
  }

  async getCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
    const completeAddress = await this.db.getCompleteAddress(account);
    if (!completeAddress) {
      throw new Error(
        `No public key registered for address ${account}.
        Register it by calling pxe.registerAccount(...).\nSee docs for context: https://docs.aztec.network/reference/common_errors/aztecnr-errors#simulation-error-no-public-key-registered-for-address-0x0-register-it-by-calling-pxeregisterrecipient-or-pxeregisteraccount`,
      );
    }
    return completeAddress;
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    const instance = await this.db.getContractInstance(address);
    if (!instance) {
      throw new Error(`No contract instance found for address ${address.toString()}`);
    }
    return instance;
  }

  async getAuthWitness(messageHash: Fr): Promise<Fr[]> {
    const witness = await this.db.getAuthWitness(messageHash);
    if (!witness) {
      throw new Error(`Unknown auth witness for message hash ${messageHash.toString()}`);
    }
    return witness;
  }

  async popCapsule(): Promise<Fr[]> {
    const capsule = await this.db.popCapsule();
    if (!capsule) {
      throw new Error(`No capsules available`);
    }
    return capsule;
  }

  async getNotes(contractAddress: AztecAddress, storageSlot: Fr, status: NoteStatus, scopes?: AztecAddress[]) {
    const noteDaos = await this.db.getNotes({
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
    const artifact = await this.contractDataOracle.getFunctionArtifact(contractAddress, selector);
    const debug = await this.contractDataOracle.getFunctionDebugMetadata(contractAddress, selector);
    return {
      ...artifact,
      debug,
    };
  }

  async getFunctionArtifactByName(
    contractAddress: AztecAddress,
    functionName: string,
  ): Promise<FunctionArtifact | undefined> {
    const instance = await this.contractDataOracle.getContractInstance(contractAddress);
    const artifact = await this.contractDataOracle.getContractArtifact(instance.contractClassId);
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

  /**
   * Retrieve the databases view of the Block Header object.
   * This structure is fed into the circuits simulator and is used to prove against certain historical roots.
   *
   * @returns A Promise that resolves to a BlockHeader object.
   */
  getBlockHeader(): Promise<BlockHeader> {
    return this.db.getBlockHeader();
  }

  /**
   * Fetches the current block number.
   * @returns The block number.
   */
  public async getBlockNumber(): Promise<number> {
    return await this.aztecNode.getBlockNumber();
  }

  public getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string> {
    return this.contractDataOracle.getDebugFunctionName(contractAddress, selector);
  }

  /**
   * Returns the full contents of your address book.
   * This is used when calculating tags for incoming notes by deriving the shared secret, the contract-siloed tagging secret, and
   * finally the index specified tag. We will then query the node with this tag for each address in the address book.
   * @returns The full list of the users contact addresses.
   */
  public getSenders(): Promise<AztecAddress[]> {
    return this.db.getSenderAddresses();
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
    const [index] = await this.db.getTaggingSecretsIndexesAsSender([appTaggingSecret]);

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
    const contractName = await this.contractDataOracle.getDebugContractName(contractAddress);
    this.log.debug(`Incrementing app tagging secret at ${contractName}(${contractAddress})`, {
      secret,
      sender,
      recipient,
      contractName,
      contractAddress,
    });

    const [index] = await this.db.getTaggingSecretsIndexesAsSender([secret]);
    await this.db.setTaggingSecretsIndexesAsSender([new IndexedTaggingSecret(secret, index + 1)]);
  }

  async #calculateAppTaggingSecret(contractAddress: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
    const senderCompleteAddress = await this.getCompleteAddress(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    const secretPoint = computeTaggingSecretPoint(senderCompleteAddress, senderIvsk, recipient);
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
    const senders = [...(await this.db.getSenderAddresses()), ...(await this.keyStore.getAccounts())].filter(
      (address, index, self) => index === self.findIndex(otherAddress => otherAddress.equals(address)),
    );
    const appTaggingSecrets = senders.map(contact => {
      const sharedSecret = computeTaggingSecretPoint(recipientCompleteAddress, recipientIvsk, contact);
      return poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
    });
    const indexes = await this.db.getTaggingSecretsIndexesAsRecipient(appTaggingSecrets);
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
    const [oldIndex] = await this.db.getTaggingSecretsIndexesAsSender([appTaggingSecret]);

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
      const currentTags = [...new Array(WINDOW_SIZE)].map((_, i) => {
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

    const contractName = await this.contractDataOracle.getDebugContractName(contractAddress);
    if (currentIndex !== oldIndex) {
      await this.db.setTaggingSecretsIndexesAsSender([new IndexedTaggingSecret(appTaggingSecret, currentIndex)]);

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
    const contractName = await this.contractDataOracle.getDebugContractName(contractAddress);
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
        const tagsForTheWholeWindow = secretsForTheWholeWindow.map(secret =>
          secret.computeSiloedTag(recipient, contractAddress),
        );

        // We store the new largest indexes we find in the iteration in the following map to later on construct
        // a new set of secrets and windows to fetch logs for.
        const newLargestIndexMapForIteration: { [k: string]: number } = {};

        // Fetch the logs for the tags and iterate over them
        const logsByTags = await this.aztecNode.getLogsByTags(tagsForTheWholeWindow);

        logsByTags.forEach((logsByTag, logIndex) => {
          if (logsByTag.length > 0) {
            // The logs for the given tag exist so we store them for later processing
            logsForRecipient.push(...logsByTag);

            // We retrieve the indexed tagging secret corresponding to the log as I need that to evaluate whether
            // a new largest index have been found.
            const secretCorrespondingToLog = secretsForTheWholeWindow[logIndex];
            const initialIndex = initialIndexesMap[secretCorrespondingToLog.appTaggingSecret.toString()];

            this.log.debug(`Found ${logsByTag.length} logs as recipient ${recipient}`, {
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
      await this.db.setTaggingSecretsIndexesAsRecipient(
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
   * @param simulator - The simulator to use for decryption.
   * @returns The decrypted notes.
   */
  async #decryptTaggedLogs(scopedLogs: TxScopedL2Log[], recipient: AztecAddress, simulator?: AcirSimulator) {
    const recipientCompleteAddress = await this.getCompleteAddress(recipient);
    const ivskM = await this.keyStore.getMasterSecretKey(
      recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey,
    );
    const addressSecret = computeAddressSecret(recipientCompleteAddress.getPreaddress(), ivskM);

    // Since we could have notes with the same index for different txs, we need
    // to keep track of them scoping by txHash
    const excludedIndices: Map<string, Set<number>> = new Map();
    const notes: NoteDao[] = [];

    const txEffectsCache = new Map<string, InBlock<TxEffect> | undefined>();

    for (const scopedLog of scopedLogs) {
      const notePayload = scopedLog.isFromPublic
        ? L1NotePayload.decryptAsIncomingFromPublic(scopedLog.logData, addressSecret)
        : L1NotePayload.decryptAsIncoming(PrivateLog.fromBuffer(scopedLog.logData), addressSecret);

      if (notePayload) {
        const payload = notePayload;

        const txEffect =
          txEffectsCache.get(scopedLog.txHash.toString()) ?? (await this.aztecNode.getTxEffect(scopedLog.txHash));

        if (!txEffect) {
          this.log.warn(`No tx effect found for ${scopedLog.txHash} while decrypting tagged logs`);
          continue;
        }

        txEffectsCache.set(scopedLog.txHash.toString(), txEffect);

        if (!excludedIndices.has(scopedLog.txHash.toString())) {
          excludedIndices.set(scopedLog.txHash.toString(), new Set());
        }
        const { note } = await produceNoteDaos(
          // I don't like this at all, but we need a simulator to run `computeNoteHashAndOptionallyANullifier`. This generates
          // a chicken-and-egg problem due to this oracle requiring a simulator, which in turn requires this oracle. Furthermore, since jest doesn't allow
          // mocking ESM exports, we have to pollute the method even more by providing a simulator parameter so tests can inject a fake one.
          simulator ?? getAcirSimulator(this.db, this.aztecNode, this.keyStore, this.contractDataOracle),
          this.db,
          notePayload ? recipient.toAddressPoint() : undefined,
          payload!,
          txEffect.data.txHash,
          txEffect.l2BlockNumber,
          txEffect.l2BlockHash,
          txEffect.data.noteHashes,
          scopedLog.dataStartIndexForTx,
          excludedIndices.get(scopedLog.txHash.toString())!,
          this.log,
        );

        if (note) {
          notes.push(note);
        }
      }
    }
    return { notes };
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
    const { notes } = await this.#decryptTaggedLogs(logs, recipient, simulator);
    if (notes.length) {
      await this.db.addNotes(notes, recipient);
      notes.forEach(noteDao => {
        this.log.verbose(`Added incoming note for contract ${noteDao.contractAddress} at slot ${noteDao.storageSlot}`, {
          contract: noteDao.contractAddress,
          slot: noteDao.storageSlot,
          nullifier: noteDao.siloedNullifier.toString(),
        });
      });
    }
  }

  public async removeNullifiedNotes(contractAddress: AztecAddress) {
    for (const recipient of await this.keyStore.getAccounts()) {
      const currentNotesForRecipient = await this.db.getNotes({ contractAddress, owner: recipient });
      const nullifiersToCheck = currentNotesForRecipient.map(note => note.siloedNullifier);
      const nullifierIndexes = await this.aztecNode.findNullifiersIndexesWithBlock('latest', nullifiersToCheck);

      const foundNullifiers = nullifiersToCheck
        .map((nullifier, i) => {
          if (nullifierIndexes[i] !== undefined) {
            return { ...nullifierIndexes[i], ...{ data: nullifier } } as InBlock<Fr>;
          }
        })
        .filter(nullifier => nullifier !== undefined) as InBlock<Fr>[];

      const nullifiedNotes = await this.db.removeNullifiedNotes(foundNullifiers, recipient.toAddressPoint());
      nullifiedNotes.forEach(noteDao => {
        this.log.verbose(`Removed note for contract ${noteDao.contractAddress} at slot ${noteDao.storageSlot}`, {
          contract: noteDao.contractAddress,
          slot: noteDao.storageSlot,
          nullifier: noteDao.siloedNullifier.toString(),
        });
      });
    }
  }

  /**
   * Used by contracts during execution to store arbitrary data in the local PXE database. The data is siloed/scoped
   * to a specific `contract`.
   * @param contract - An address of a contract that is requesting to store the data.
   * @param key - A field element representing the key to store the data under.
   * @param values - An array of field elements representing the data to store.
   */
  store(contract: AztecAddress, key: Fr, values: Fr[]): Promise<void> {
    return this.db.store(contract, key, values);
  }

  /**
   * Used by contracts during execution to load arbitrary data from the local PXE database. The data is siloed/scoped
   * to a specific `contract`.
   * @param contract - An address of a contract that is requesting to load the data.
   * @param key - A field element representing the key under which to load the data..
   * @returns An array of field elements representing the stored data or `null` if no data is stored under the key.
   */
  load(contract: AztecAddress, key: Fr): Promise<Fr[] | null> {
    return this.db.load(contract, key);
  }
}
