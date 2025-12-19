import type { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockParameter } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId, NullifierMembershipWitness } from '@aztec/stdlib/trees';

import type { AnchorBlockDataProvider } from '../storage/index.js';

export class MembershipWitnessService {
  constructor(
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockDataProvider: AnchorBlockDataProvider,
  ) {}

  public async getMembershipWitness(blockNumber: BlockParameter, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
    const witness = await this.#tryGetMembershipWitness(blockNumber, treeId, leafValue);
    if (!witness) {
      throw new Error(`Leaf value ${leafValue} not found in tree ${MerkleTreeId[treeId]} at block ${blockNumber}`);
    }
    return witness;
  }

  public async getLowNullifierMembershipWitness(
    blockNumber: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
    if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }
    return this.aztecNode.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  async #tryGetMembershipWitness(
    blockNumber: BlockParameter,
    treeId: MerkleTreeId,
    value: Fr,
  ): Promise<Fr[] | undefined> {
    switch (treeId) {
      case MerkleTreeId.NULLIFIER_TREE:
        return (await this.aztecNode.getNullifierMembershipWitness(blockNumber, value))?.withoutPreimage().toFields();
      case MerkleTreeId.NOTE_HASH_TREE:
        return (await this.aztecNode.getNoteHashMembershipWitness(blockNumber, value))?.toFields();
      case MerkleTreeId.PUBLIC_DATA_TREE:
        return (await this.aztecNode.getPublicDataWitness(blockNumber, value))?.withoutPreimage().toFields();
      case MerkleTreeId.ARCHIVE:
        return (await this.aztecNode.getArchiveMembershipWitness(blockNumber, value))?.toFields();
      default:
        throw new Error('Not implemented');
    }
  }
}
