import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { type AztecNode, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import type { AnchorBlockDataProvider, NoteDataProvider } from '../storage/index.js';

export class NoteSynchronizer {
  constructor(
    private readonly noteDataProvider: NoteDataProvider,
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockDataProvider: AnchorBlockDataProvider,
  ) {}

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
}
