import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { type AztecNode, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/server';
import { Note, NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { type AnchorBlockDataProvider, NoteDao, type NoteDataProvider } from '../storage/index.js';

export class NoteService {
  constructor(
    private readonly noteDataProvider: NoteDataProvider,
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockDataProvider: AnchorBlockDataProvider,
  ) {}

  public async getNotes(
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
   * Looks for nullifiers of active contract notes and marks them as nullified if a nullifier is found.
   *
   * Fetches notes from the NoteDataProvider and checks which nullifiers are present in the
   * onchain nullifier Merkle tree - up to the latest locally synced block. We use the
   * locally synced block instead of querying the chain's 'latest' block to ensure correctness:
   * notes are only marked nullified once their corresponding nullifier has been included in a
   * block up to which the PXE has synced.
   * This allows recent nullifications to be processed even if the node is not an archive node.
   *
   * @param contractAddress - The contract whose notes should be checked and nullified.
   */
  public async syncNoteNullifiers(contractAddress: AztecAddress): Promise<void> {
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

    await this.noteDataProvider.applyNullifiers(foundNullifiers);
  }

  public async deliverNote(
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

    if (nullifierIndex !== undefined) {
      const { data: _, ...blockHashAndNum } = nullifierIndex;
      await this.noteDataProvider.applyNullifiers([{ data: siloedNullifier, ...blockHashAndNum }]);
    }
  }
}
