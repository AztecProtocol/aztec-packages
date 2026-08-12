import { chunk } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AnchoredBlockParameter, DataInBlock, InBlock } from '@aztec/stdlib/block';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { type AztecNode, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/client';
import { Note, NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { NoteValidationRequest } from '../contract_function_simulator/noir-structs/note_validation_request.js';
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
   * @param scopes - The accounts whose notes we can access in this call. An empty list matches no notes.
   */
  public async getNotes(
    contractAddress: AztecAddress,
    owner: AztecAddress | undefined,
    storageSlot: Fr,
    status: NoteStatus,
    scopes: AztecAddress[],
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
  public async syncNoteNullifiers(contractAddress: AztecAddress, scopes: AztecAddress[]): Promise<void> {
    const anchor = await this.anchorBlockHeader.toBlockParameter();

    const contractNotes = await this.noteStore.getNotes({ contractAddress, scopes }, this.jobId);

    if (contractNotes.length === 0) {
      return;
    }

    const nullifiersToCheck = contractNotes.map(note => note.siloedNullifier);
    const nullifierIndexes = await this.#findNullifierIndexes(anchor, nullifiersToCheck);

    const foundNullifiers = nullifiersToCheck
      .map((nullifier, i) => {
        if (nullifierIndexes[i] !== undefined) {
          return { ...nullifierIndexes[i], ...{ data: nullifier } } as DataInBlock<Fr>;
        }
      })
      .filter(nullifier => nullifier !== undefined) as DataInBlock<Fr>[];

    await this.noteStore.applyNullifiers(foundNullifiers, this.jobId);
  }

  /**
   * Validates and stores a batch of notes against the pre-fetched onchain context of their txs.
   *
   * For each request we must verify that:
   *  - the note actually exists in the corresponding tx effect (and thus in the note hash tree), and
   *  - the note has not already been nullified.
   *
   * Failing to do either would result in circuits getting either non-existent notes and failing to produce inclusion
   * proofs for them, or getting nullified notes and producing duplicate nullifiers, both of which are catastrophic
   * failure modes.
   *
   * Note that adding a note and removing it is *not* equivalent to never adding it in the first place. A nullifier
   * emitted in a block that comes after note creation might result in the note being de-nullified by a chain reorg,
   * so we must store both the note hash and nullifier block information.
   *
   * @param requests - The notes to validate and store.
   * @param scope - The scope under which the notes are being stored.
   * @param validationTxData - The onchain context of each request's tx, keyed by `TxHash.toString()`. Must contain
   * entries for every request's txHash; missing entries are treated as a node bug and cause an error.
   */
  public async validateAndStoreNotes(
    requests: NoteValidationRequest[],
    scope: AztecAddress,
    validationTxData: ReadonlyMap<string, NoteValidationTxData>,
  ): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    // We avoid making node queries at 'latest' since we don't want to process notes or nullifiers that only exist ahead
    // in time of the locally synced state.
    // Note that while this technically results in historical queries, we perform it at the latest locally synced block
    // number which *should* be recent enough to be available, even for non-archive nodes.
    // Also note that the note should never be ahead of the synced block here since `fetchTaggedLogs` only processes
    // logs up to the synced block making this only an additional safety check.
    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();
    const anchor = await this.anchorBlockHeader.toBlockParameter();

    // By computing siloed and unique note hashes ourselves we prevent contracts from interfering with the note storage
    // of other contracts, which would constitute a security breach.
    const computed = await Promise.all(
      requests.map(async ({ contractAddress, noteHash, nullifier, noteNonce }) => {
        const [siloedNoteHash, siloedNullifier] = await Promise.all([
          siloNoteHash(contractAddress, noteHash),
          siloNullifier(contractAddress, nullifier),
        ]);
        const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, siloedNoteHash);
        return { uniqueNoteHash, siloedNullifier };
      }),
    );

    const nullifierIndexes = await this.#findNullifierIndexes(
      anchor,
      computed.map(c => c.siloedNullifier),
    );

    const noteDaos: NoteDao[] = [];
    const foundNullifiers: DataInBlock<Fr>[] = [];

    for (let i = 0; i < requests.length; i++) {
      const { contractAddress, owner, storageSlot, randomness, noteNonce, content, noteHash, txHash } = requests[i];
      const { uniqueNoteHash, siloedNullifier } = computed[i];
      const nullifierIndex = nullifierIndexes[i];

      const txData = validationTxData.get(txHash.toString());
      if (!txData) {
        // We error out instead of just logging a warning and skipping the note because this would indicate a bug. This
        // is because the node has already served info about this tx either when obtaining the log (LogResult carries
        // the tx info) or when getting metadata for the offchain message (before the message got passed to
        // `process_log`).
        throw new Error(`Could not find tx effect for tx hash ${txHash} when processing a note.`);
      }

      if (txData.l2BlockNumber > anchorBlockNumber) {
        // If the message was delivered onchain, this would indicate a bug: log sync should never load logs from blocks
        // newer than the anchor block. If the note came via an offchain message, it would likely also be a bug, since
        // we sync a new anchor block before calling `process_message`. For this not to be a bug, the message would
        // need to come from a newer block than the anchor served by the node, implying the node isn't properly synced.
        //     We therefore error out here rather than assuming the offchain message was constructed by a malicious
        // sender with the intention of bricking recipient's PXE (if we assumed that we would just ignore the message).
        throw new Error(
          `Obtained a newer tx effect for ${txHash} for a note validation request than the anchor block ${anchorBlockNumber}. This is a bug as we should not ever be processing a note from a newer block than the anchor block.`,
        );
      }

      // Find the index of the note hash in the noteHashes array to determine note ordering within the tx
      const noteIndexInTx = txData.noteHashes.findIndex(nh => nh.equals(uniqueNoteHash));
      if (noteIndexInTx === -1) {
        // Similar to the comment above - we error out as this would indicate a bug in nonce discovery.
        throw new Error(`Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present in tx ${txHash}`);
      }

      noteDaos.push(
        new NoteDao(
          new Note(content),
          contractAddress,
          owner,
          storageSlot,
          randomness,
          noteNonce,
          noteHash,
          siloedNullifier,
          txHash,
          txData.l2BlockNumber,
          txData.l2BlockHash.toString(),
          txData.txIndexInBlock,
          noteIndexInTx,
        ),
      );

      if (nullifierIndex !== undefined) {
        // We found a nullifier index which implies that the note has already been nullified.
        const { data: _, ...blockHashAndNum } = nullifierIndex;
        foundNullifiers.push({ data: siloedNullifier, ...blockHashAndNum });
      }
    }

    await this.noteStore.addNotes(noteDaos, scope, this.jobId);

    if (foundNullifiers.length > 0) {
      await this.noteStore.applyNullifiers(foundNullifiers, this.jobId);
    }
  }

  async #findNullifierIndexes(anchor: AnchoredBlockParameter, siloedNullifiers: Fr[]) {
    const batches = chunk(siloedNullifiers, MAX_RPC_LEN);
    return (
      await Promise.all(
        batches.map(batch => this.aztecNode.findLeavesIndexes(anchor, MerkleTreeId.NULLIFIER_TREE, batch)),
      )
    ).flat();
  }
}

/** The onchain context of the tx a note validation request points at: where it was mined and its note hashes. */
export type NoteValidationTxData = InBlock & {
  noteHashes: Fr[];
  txIndexInBlock: number;
};
