import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { type AztecNode, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/client';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import type { ExecutionDataProvider } from '../contract_function_simulator/execution_data_provider.js';
import type { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import type { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
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
    private anchorBlockDataProvider: AnchorBlockDataProvider,
    private log = createLogger('pxe:pxe_oracle_interface'),
  ) {}

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
