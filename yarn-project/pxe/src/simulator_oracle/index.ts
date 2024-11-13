import {
  type AztecNode,
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
  type CompleteAddress,
  type ContractInstance,
  Fr,
  type FunctionSelector,
  type Header,
  IndexedTaggingSecret,
  type KeyValidationRequest,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  computeAddressSecret,
  computePoint,
  computeTaggingSecret,
} from '@aztec/circuits.js';
import { type FunctionArtifact, getFunctionArtifact } from '@aztec/foundation/abi';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { type KeyStore } from '@aztec/key-store';
import { type AcirSimulator, type DBOracle, MessageLoadOracleInputs } from '@aztec/simulator';

import { type ContractDataOracle } from '../contract_data_oracle/index.js';
import { type IncomingNoteDao } from '../database/incoming_note_dao.js';
import { type PxeDatabase } from '../database/index.js';
import { type OutgoingNoteDao } from '../database/outgoing_note_dao.js';
import { produceNoteDaos } from '../note_decryption_utils/produce_note_daos.js';
import { getAcirSimulator } from '../simulator/index.js';

/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class SimulatorOracle implements DBOracle {
  constructor(
    private contractDataOracle: ContractDataOracle,
    private db: PxeDatabase,
    private keyStore: KeyStore,
    private aztecNode: AztecNode,
    private log = createDebugLogger('aztec:pxe:simulator_oracle'),
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
    const noteDaos = await this.db.getIncomingNotes({
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
    return await this.findLeafIndex('latest', MerkleTreeId.NOTE_HASH_TREE, commitment);
  }

  // We need this in public as part of the EXISTS calls - but isn't used in private
  public getCommitmentValue(_leafIndex: bigint): Promise<Fr | undefined> {
    throw new Error('Unimplemented in private!');
  }

  async getNullifierIndex(nullifier: Fr) {
    return await this.findLeafIndex('latest', MerkleTreeId.NULLIFIER_TREE, nullifier);
  }

  public async findLeafIndex(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafValue: Fr,
  ): Promise<bigint | undefined> {
    const [leafIndex] = await this.aztecNode.findLeavesIndexes(blockNumber, treeId, [leafValue]);
    return leafIndex;
  }

  public async getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: bigint): Promise<Fr[]> {
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
   * @returns A Promise that resolves to a Header object.
   */
  getHeader(): Promise<Header> {
    return Promise.resolve(this.db.getHeader());
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
  public getContacts(): AztecAddress[] {
    return this.db.getContactAddresses();
  }

  /**
   * Returns the tagging secret for a given sender and recipient pair. For this to work, the ivpsk_m of the sender must be known.
   * Includes the next index to be used used for tagging with this secret.
   * @param contractAddress - The contract address to silo the secret for
   * @param sender - The address sending the note
   * @param recipient - The address receiving the note
   * @returns A siloed tagging secret that can be used to tag notes.
   */
  public async getAppTaggingSecretAsSender(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret> {
    const secret = await this.#calculateTaggingSecret(contractAddress, sender, recipient);
    const [index] = await this.db.getTaggingSecretsIndexesAsSender([secret]);
    return new IndexedTaggingSecret(secret, index);
  }

  /**
   * Increments the tagging secret for a given sender and recipient pair. For this to work, the ivpsk_m of the sender must be known.
   * @param contractAddress - The contract address to silo the secret for
   * @param sender - The address sending the note
   * @param recipient - The address receiving the note
   */
  public async incrementAppTaggingSecretIndexAsSender(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<void> {
    const secret = await this.#calculateTaggingSecret(contractAddress, sender, recipient);
    const contractName = await this.contractDataOracle.getDebugContractName(contractAddress);
    this.log.verbose(
      `Incrementing secret ${secret} as sender ${sender} for recipient: ${recipient} at contract: ${contractName}(${contractAddress})`,
    );
    await this.db.incrementTaggingSecretsIndexesAsSender([secret]);
  }

  async #calculateTaggingSecret(contractAddress: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
    const senderCompleteAddress = await this.getCompleteAddress(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    const sharedSecret = computeTaggingSecret(senderCompleteAddress, senderIvsk, recipient);
    // Silo the secret to the app so it can't be used to track other app's notes
    const siloedSecret = poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
    return siloedSecret;
  }

  /**
   * Returns the siloed tagging secrets for a given recipient and all the senders in the address book
   * This method should be exposed as an oracle call to allow aztec.nr to perform the orchestration
   * of the syncTaggedLogs and processTaggedLogs methods. However, it is not possible to do so at the moment,
   * so we're keeping it private for now.
   * @param contractAddress - The contract address to silo the secret for
   * @param recipient - The address receiving the notes
   * @returns A list of siloed tagging secrets
   */
  async #getAppTaggingSecretsForContacts(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret[]> {
    const recipientCompleteAddress = await this.getCompleteAddress(recipient);
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);

    // We implicitly add all PXE accounts as contacts, this helps us decrypt tags on notes that we send to ourselves (recipient = us, sender = us)
    const contacts = [...this.db.getContactAddresses(), ...(await this.keyStore.getAccounts())].filter(
      (address, index, self) => index === self.findIndex(otherAddress => otherAddress.equals(address)),
    );
    const appTaggingSecrets = contacts.map(contact => {
      const sharedSecret = computeTaggingSecret(recipientCompleteAddress, recipientIvsk, contact);
      return poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
    });
    const indexes = await this.db.getTaggingSecretsIndexesAsRecipient(appTaggingSecrets);
    return appTaggingSecrets.map((secret, i) => new IndexedTaggingSecret(secret, indexes[i]));
  }

  /**
   * Synchronizes the logs tagged with scoped addresses and all the senders in the addressbook.
   * Returns the unsynched logs and updates the indexes of the secrets used to tag them until there are no more logs to sync.
   * @param contractAddress - The address of the contract that the logs are tagged for
   * @param recipient - The address of the recipient
   * @returns A list of encrypted logs tagged with the recipient's address
   */
  public async syncTaggedLogs(
    contractAddress: AztecAddress,
    maxBlockNumber: number,
    scopes?: AztecAddress[],
  ): Promise<Map<string, TxScopedL2Log[]>> {
    const recipients = scopes ? scopes : await this.keyStore.getAccounts();
    const result = new Map<string, TxScopedL2Log[]>();
    const contractName = await this.contractDataOracle.getDebugContractName(contractAddress);
    for (const recipient of recipients) {
      const logs: TxScopedL2Log[] = [];
      // Ideally this algorithm would be implemented in noir, exposing its building blocks as oracles.
      // However it is impossible at the moment due to the language not supporting nested slices.
      // This nesting is necessary because for a given set of tags we don't
      // know how many logs we will get back. Furthermore, these logs are of undetermined
      // length, since we don't really know the note they correspond to until we decrypt them.

      // 1. Get all the secrets for the recipient and sender pairs (#9365)
      const appTaggingSecrets = await this.#getAppTaggingSecretsForContacts(contractAddress, recipient);

      // 1.1 Set up a sliding window with an offset. Chances are the sender might have messed up
      // and inadvertedly incremented their index without use getting any logs (for example, in case
      // of a revert). If we stopped looking for logs the first time
      // we receive 0 for a tag, we might never receive anything from that sender again.
      // Also there's a possibility that we have advanced our index, but the sender has reused it, so
      // we might have missed some logs. For these reasons, we have to look both back and ahead of the
      // stored index
      const INDEX_OFFSET = 10;
      type SearchState = {
        currentTagggingSecrets: IndexedTaggingSecret[];
        maxIndexesToCheck: { [k: string]: number };
        initialSecretIndexes: { [k: string]: number };
        secretsToIncrement: { [k: string]: number };
      };
      const searchState = appTaggingSecrets.reduce<SearchState>(
        (acc, appTaggingSecret) => ({
          // Start looking for logs before the stored index
          currentTagggingSecrets: acc.currentTagggingSecrets.concat([
            new IndexedTaggingSecret(appTaggingSecret.secret, Math.max(0, appTaggingSecret.index - INDEX_OFFSET)),
          ]),
          // Keep looking for logs beyond the stored index
          maxIndexesToCheck: {
            ...acc.maxIndexesToCheck,
            ...{ [appTaggingSecret.secret.toString()]: appTaggingSecret.index + INDEX_OFFSET },
          },
          // Keeps track of the secrets we have to increment in the database
          secretsToIncrement: {},
          // Store the initial set of indexes for the secrets
          initialSecretIndexes: {
            ...acc.initialSecretIndexes,
            ...{ [appTaggingSecret.secret.toString()]: appTaggingSecret.index },
          },
        }),
        { currentTagggingSecrets: [], maxIndexesToCheck: {}, secretsToIncrement: {}, initialSecretIndexes: {} },
      );

      let { currentTagggingSecrets } = searchState;
      const { maxIndexesToCheck, secretsToIncrement, initialSecretIndexes } = searchState;

      while (currentTagggingSecrets.length > 0) {
        // 2. Compute tags using the secrets, recipient and index. Obtain logs for each tag (#9380)
        const currentTags = currentTagggingSecrets.map(taggingSecret => taggingSecret.computeTag(recipient));
        const logsByTags = await this.aztecNode.getLogsByTags(currentTags);
        const newTaggingSecrets: IndexedTaggingSecret[] = [];
        logsByTags.forEach((logsByTag, logIndex) => {
          const { secret: currentSecret, index: currentIndex } = currentTagggingSecrets[logIndex];
          const currentSecretAsStr = currentSecret.toString();
          this.log.debug(
            `Syncing logs for recipient ${recipient}, secret ${currentSecretAsStr}:${currentIndex} at contract: ${contractName}(${contractAddress})`,
          );
          // 3.1. Append logs to the list and increment the index for the tags that have logs (#9380)
          if (logsByTag.length > 0) {
            this.log.verbose(
              `Found ${
                logsByTag.length
              } logs for secret ${currentSecretAsStr} as recipient ${recipient}. Incrementing index to ${
                currentIndex + 1
              } at contract: ${contractName}(${contractAddress})`,
            );
            logs.push(...logsByTag);

            if (currentIndex >= initialSecretIndexes[currentSecretAsStr]) {
              // 3.2. Increment the index for the tags that have logs, provided they're higher than the one
              // we have stored in the db (#9380)
              secretsToIncrement[currentSecretAsStr] = currentIndex + 1;
              // 3.3. Slide the window forwards if we have found logs beyond the initial index
              maxIndexesToCheck[currentSecretAsStr] = currentIndex + INDEX_OFFSET;
            }
          }
          // 3.4 Keep increasing the index (inside the window) temporarily for the tags that have no logs
          // There's a chance the sender missed some and we want to catch up
          if (currentIndex < maxIndexesToCheck[currentSecretAsStr]) {
            const newTaggingSecret = new IndexedTaggingSecret(currentSecret, currentIndex + 1);
            newTaggingSecrets.push(newTaggingSecret);
          }
        });
        await this.db.setTaggingSecretsIndexesAsRecipient(
          Object.keys(secretsToIncrement).map(
            secret => new IndexedTaggingSecret(Fr.fromString(secret), secretsToIncrement[secret]),
          ),
        );
        currentTagggingSecrets = newTaggingSecrets;
      }

      result.set(
        recipient.toString(),
        logs.filter(log => log.blockNumber <= maxBlockNumber),
      );
    }
    return result;
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
    const ovskM = await this.keyStore.getMasterSecretKey(
      recipientCompleteAddress.publicKeys.masterOutgoingViewingPublicKey,
    );
    // Since we could have notes with the same index for different txs, we need
    // to keep track of them scoping by txHash
    const excludedIndices: Map<string, Set<number>> = new Map();
    const incomingNotes: IncomingNoteDao[] = [];
    const outgoingNotes: OutgoingNoteDao[] = [];

    const txEffectsCache = new Map<string, TxEffect | undefined>();

    for (const scopedLog of scopedLogs) {
      const incomingNotePayload = L1NotePayload.decryptAsIncoming(
        scopedLog.logData,
        addressSecret,
        scopedLog.isFromPublic,
      );
      const outgoingNotePayload = L1NotePayload.decryptAsOutgoing(scopedLog.logData, ovskM, scopedLog.isFromPublic);

      if (incomingNotePayload || outgoingNotePayload) {
        if (incomingNotePayload && outgoingNotePayload && !incomingNotePayload.equals(outgoingNotePayload)) {
          this.log.warn(
            `Incoming and outgoing note payloads do not match. Incoming: ${JSON.stringify(
              incomingNotePayload,
            )}, Outgoing: ${JSON.stringify(outgoingNotePayload)}`,
          );
          continue;
        }

        const payload = incomingNotePayload || outgoingNotePayload;

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
        const { incomingNote, outgoingNote } = await produceNoteDaos(
          // I don't like this at all, but we need a simulator to run `computeNoteHashAndOptionallyANullifier`. This generates
          // a chicken-and-egg problem due to this oracle requiring a simulator, which in turn requires this oracle. Furthermore, since jest doesn't allow
          // mocking ESM exports, we have to pollute the method even more by providing a simulator parameter so tests can inject a fake one.
          simulator ?? getAcirSimulator(this.db, this.aztecNode, this.keyStore, this.contractDataOracle),
          this.db,
          incomingNotePayload ? computePoint(recipient) : undefined,
          outgoingNotePayload ? recipientCompleteAddress.publicKeys.masterOutgoingViewingPublicKey : undefined,
          payload!,
          txEffect.txHash,
          txEffect.noteHashes,
          scopedLog.dataStartIndexForTx,
          excludedIndices.get(scopedLog.txHash.toString())!,
          this.log,
        );

        if (incomingNote) {
          incomingNotes.push(incomingNote);
        }
        if (outgoingNote) {
          outgoingNotes.push(outgoingNote);
        }
      }
    }
    return { incomingNotes, outgoingNotes };
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
    const { incomingNotes, outgoingNotes } = await this.#decryptTaggedLogs(logs, recipient, simulator);
    if (incomingNotes.length || outgoingNotes.length) {
      await this.db.addNotes(incomingNotes, outgoingNotes, recipient);
      incomingNotes.forEach(noteDao => {
        this.log.verbose(
          `Added incoming note for contract ${noteDao.contractAddress} at slot ${
            noteDao.storageSlot
          } with nullifier ${noteDao.siloedNullifier.toString()}`,
        );
      });
      outgoingNotes.forEach(noteDao => {
        this.log.verbose(`Added outgoing note for contract ${noteDao.contractAddress} at slot ${noteDao.storageSlot}`);
      });
    }
    const nullifiedNotes: IncomingNoteDao[] = [];
    const currentNotesForRecipient = await this.db.getIncomingNotes({ owner: recipient });
    const nullifierIndexes = await this.aztecNode.findLeavesIndexes(
      'latest',
      MerkleTreeId.NULLIFIER_TREE,
      currentNotesForRecipient.map(note => note.siloedNullifier),
    );

    const foundNullifiers = currentNotesForRecipient
      .filter((_, i) => nullifierIndexes[i] !== undefined)
      .map(note => note.siloedNullifier);

    await this.db.removeNullifiedNotes(foundNullifiers, computePoint(recipient));
    nullifiedNotes.forEach(noteDao => {
      this.log.verbose(
        `Removed note for contract ${noteDao.contractAddress} at slot ${
          noteDao.storageSlot
        } with nullifier ${noteDao.siloedNullifier.toString()}`,
      );
    });
  }
}
