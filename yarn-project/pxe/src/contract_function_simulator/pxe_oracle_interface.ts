import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { type AztecNode, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/client';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { TxHash } from '@aztec/stdlib/tx';

import type { ExecutionDataProvider } from '../contract_function_simulator/execution_data_provider.js';
import type { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import type { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import type { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import type { PrivateEventDataProvider } from '../storage/private_event_data_provider/private_event_data_provider.js';
import { EventValidationRequest } from './noir-structs/event_validation_request.js';
import { NoteValidationRequest } from './noir-structs/note_validation_request.js';
import type { ProxiedNode } from './proxied_node.js';

/**
 * A data layer that provides and stores information needed for simulating/proving a transaction.
 */
export class PXEOracleInterface implements ExecutionDataProvider {
  // Note: The Aztec node and senderDataProvider are exposed publicly since PXEOracleInterface will be deprecated soon
  // (issue #17776). When refactoring tagging, it made sense to align with this future change by moving the sender
  // tagging index sync functionality elsewhere. This required exposing these two properties since there is currently
  // no alternative way to access them in the PrivateExecutionOracle.
  constructor(
    public readonly aztecNode: AztecNode | ProxiedNode,
    private noteDataProvider: NoteDataProvider,
    private capsuleDataProvider: CapsuleDataProvider,
    private anchorBlockDataProvider: AnchorBlockDataProvider,
    private privateEventDataProvider: PrivateEventDataProvider,
    private log = createLogger('pxe:pxe_oracle_interface'),
  ) {}

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
    await this.capsuleDataProvider.setCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, []);
    await this.capsuleDataProvider.setCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, []);
  }

  async deliverNote(
    contractAddress: AztecAddress,
    owner: AztecAddress,
    storageSlot: Fr,
    randomness: Fr,
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
    const syncedBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

    // By computing siloed and unique note hashes ourselves we prevent contracts from interfering with the note storage
    // of other contracts, which would constitute a security breach.
    const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
    const siloedNullifier = await siloNullifier(contractAddress, nullifier);

    const txEffect = await this.aztecNode.getTxEffect(txHash);
    if (!txEffect) {
      throw new Error(`Could not find tx effect for tx hash ${txHash}`);
    }

    if (txEffect.l2BlockNumber > syncedBlockNumber) {
      throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${syncedBlockNumber}`);
    }

    const noteInTx = txEffect.data.noteHashes.some(nh => nh.equals(uniqueNoteHash));
    if (!noteInTx) {
      throw new Error(`Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present in tx ${txHash}`);
    }

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
      owner,
      storageSlot,
      randomness,
      noteNonce,
      noteHash,
      siloedNullifier,
      txHash,
      uniqueNoteHashTreeIndexInBlock.l2BlockNumber,
      uniqueNoteHashTreeIndexInBlock.l2BlockHash.toString(),
      uniqueNoteHashTreeIndexInBlock.data,
    );

    // The note was found by `recipient`, so we use that as the scope when storing the note.
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
      await this.noteDataProvider.applyNullifiers([{ data: siloedNullifier, ...blockHashAndNum }]);

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
    scope: AztecAddress,
  ): Promise<void> {
    // While using 'latest' block number would be fine for private events since they cannot be accessed from Aztec.nr
    // (and thus we're less concerned about being ahead of the synced block), we use the synced block number to
    // maintain consistent behavior in the PXE. Additionally, events should never be ahead of the synced block here
    // since `fetchTaggedLogs` only processes logs up to the synced block.
    const [syncedBlockHeader, siloedEventCommitment, txEffect] = await Promise.all([
      this.anchorBlockDataProvider.getBlockHeader(),
      siloNullifier(contractAddress, eventCommitment),
      this.aztecNode.getTxEffect(txHash),
    ]);

    const syncedBlockNumber = syncedBlockHeader.getBlockNumber();

    if (!txEffect) {
      throw new Error(`Could not find tx effect for tx hash ${txHash}`);
    }

    if (txEffect.l2BlockNumber > syncedBlockNumber) {
      throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${syncedBlockNumber}`);
    }

    const eventInTx = txEffect.data.nullifiers.some(n => n.equals(siloedEventCommitment));
    if (!eventInTx) {
      throw new Error(
        `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present in tx ${txHash}`,
      );
    }

    const [nullifierIndex] = await this.aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [
      siloedEventCommitment,
    ]);

    if (nullifierIndex === undefined) {
      throw new Error(
        `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present on the nullifier tree at block ${syncedBlockNumber} (from tx ${txHash})`,
      );
    }

    return this.privateEventDataProvider.storePrivateEventLog(
      selector,
      content,
      Number(nullifierIndex.data), // Index of the event commitment in the nullifier tree
      {
        contractAddress,
        scope,
        txHash,
        l2BlockNumber: nullifierIndex.l2BlockNumber, // Block number in which the event was emitted
        l2BlockHash: nullifierIndex.l2BlockHash, // Block hash in which the event was emitted
      },
    );
  }

  /**
   * Looks for nullifiers of active contract notes and marks them as nullified if a nullifier is found.
   *
   * Fetches notes from the NoteDataProvider and checks which nullifiers are present in the
   * onchain nullifier Merkle tree -  up to the latest locally synced block. We use the
   * locally synced block instead of querying the chain's 'latest' block to ensure correctness:
   * notes are only marked nullified once their corresponding nullifier has been included in a
   * block up to which the PXE has synced.
   * This allows recent nullifications to be processed even if the node is not an archive node.
   *
   * @param contractAddress - The contract whose notes should be checked and nullified.
   */
  public async syncNoteNullifiers(contractAddress: AztecAddress) {
    this.log.verbose('Searching for nullifiers of known notes', { contract: contractAddress });

    const syncedBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

    const contractNotes = await this.noteDataProvider.getNotes({ contractAddress });

    if (contractNotes.length === 0) {
      return;
    }

    const nullifiersToCheck = contractNotes.map(note => note.siloedNullifier);
    const nullifierBatches = nullifiersToCheck.reduce(
      (acc, nullifier) => {
        if (acc[acc.length - 1].length < MAX_RPC_LEN) {
          acc[acc.length - 1].push(nullifier);
        } else {
          acc.push([nullifier]);
        }
        return acc;
      },
      [[]] as Fr[][],
    );
    const nullifierIndexes = (
      await Promise.all(
        nullifierBatches.map(batch =>
          this.aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, batch),
        ),
      )
    ).flat();

    const foundNullifiers = nullifiersToCheck
      .map((nullifier, i) => {
        if (nullifierIndexes[i] !== undefined) {
          return { ...nullifierIndexes[i], ...{ data: nullifier } } as DataInBlock<Fr>;
        }
      })
      .filter(nullifier => nullifier !== undefined) as DataInBlock<Fr>[];

    const nullifiedNotes = await this.noteDataProvider.applyNullifiers(foundNullifiers);
    nullifiedNotes.forEach(noteDao => {
      this.log.verbose(`Removed note for contract ${noteDao.contractAddress} at slot ${noteDao.storageSlot}`, {
        contract: noteDao.contractAddress,
        slot: noteDao.storageSlot,
        nullifier: noteDao.siloedNullifier.toString(),
      });
    });
  }
}
