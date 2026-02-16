import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { type AztecNode, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/client';
import { Note, NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import type { AccessScopes } from '../access_scopes.js';
import type { NoteStore } from '../storage/note_store/note_store.js';

export class NoteService {
  constructor(
    private readonly noteStore: NoteStore,
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockHeader: BlockHeader,
    private readonly jobId: string,
  ) {}

  /**
   * Retrieves a set of notes stored in the database for a given contract address and storage slot.
   * The query result is paginated using 'limit' and 'offset' values.
   * Returns an object containing an array of note data.
   *
   * @param owner - The owner of the notes. If undefined, returns notes for all known owners.
   * @param status - The status of notes to fetch.
   * @param scopes - The accounts whose notes we can access in this call. Currently optional and will default to all.
   */
  public async getNotes(
    contractAddress: AztecAddress,
    owner: AztecAddress | undefined,
    storageSlot: Fr,
    status: NoteStatus,
    scopes: AccessScopes,
  ) {
    const noteDaos = await this.noteStore.getNotes(
      {
        contractAddress,
        owner,
        storageSlot,
        status,
        scopes,
      },
      this.jobId,
    );
    return noteDaos.map(
      ({ contractAddress, owner, storageSlot, randomness, noteNonce, note, noteHash, siloedNullifier }) => ({
        contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce,
        note,
        noteHash,
        isPending: false, // Note service deals only with settled notes
        siloedNullifier,
      }),
    );
  }

  /**
   * Looks for nullifiers of active contract notes and marks them as nullified if a nullifier is found.
   *
   * Fetches notes from the NoteStore and checks which nullifiers are present in the
   * onchain nullifier Merkle tree - up to the latest locally synced block. We use the
   * locally synced block instead of querying the chain's 'latest' block to ensure correctness:
   * notes are only marked nullified once their corresponding nullifier has been included in a
   * block up to which the PXE has synced.
   * This allows recent nullifications to be processed even if the node is not an archive node.
   *
   * @param contractAddress - The contract whose notes should be checked and nullified.
   */
  public async syncNoteNullifiers(contractAddress: AztecAddress, scopes: AccessScopes): Promise<void> {
    const anchorBlockHash = await this.anchorBlockHeader.hash();

    const contractNotes = await this.noteStore.getNotes({ contractAddress, scopes }, this.jobId);

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
          this.aztecNode.findLeavesIndexes(anchorBlockHash, MerkleTreeId.NULLIFIER_TREE, batch),
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

    await this.noteStore.applyNullifiers(foundNullifiers, this.jobId);
  }

  public async validateAndStoreNote(
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
    // We are going to store the new note in the NoteStore, which will let us later return it via `getNotes`.
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
    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();
    const anchorBlockHash = await this.anchorBlockHeader.hash();

    // By computing siloed and unique note hashes ourselves we prevent contracts from interfering with the note storage
    // of other contracts, which would constitute a security breach.
    const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
    const siloedNullifier = await siloNullifier(contractAddress, nullifier);

    const [txEffect, [nullifierIndex]] = await Promise.all([
      this.aztecNode.getTxEffect(txHash),
      this.aztecNode.findLeavesIndexes(anchorBlockHash, MerkleTreeId.NULLIFIER_TREE, [siloedNullifier]),
    ]);
    if (!txEffect) {
      throw new Error(`Could not find tx effect for tx hash ${txHash}`);
    }

    if (txEffect.l2BlockNumber > anchorBlockNumber) {
      throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${anchorBlockNumber}`);
    }

    // Find the index of the note hash in the noteHashes array to determine note ordering within the tx
    const noteIndexInTx = txEffect.data.noteHashes.findIndex(nh => nh.equals(uniqueNoteHash));
    if (noteIndexInTx === -1) {
      throw new Error(`Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present in tx ${txHash}`);
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
      txEffect.l2BlockNumber,
      txEffect.l2BlockHash.toString(),
      txEffect.txIndexInBlock,
      noteIndexInTx,
    );

    // The note was found by `recipient`, so we use that as the scope when storing the note.
    await this.noteStore.addNotes([noteDao], recipient, this.jobId);

    if (nullifierIndex !== undefined) {
      // We found nullifier index which implies that the note has already been nullified.
      const { data: _, ...blockHashAndNum } = nullifierIndex;
      await this.noteStore.applyNullifiers([{ data: siloedNullifier, ...blockHashAndNum }], this.jobId);
    }
  }
}
