import { MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/circuit-types';
import {
  type AztecAddress,
  type ContractDataSource,
  Fr,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { WorldStateDB } from '@aztec/simulator';

export class TXEWorldStateDB extends WorldStateDB {
  constructor(private merkleDb: MerkleTreeWriteOperations, dataSource: ContractDataSource) {
    super(merkleDb, dataSource);
  }

  override async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const leafSlot = computePublicDataTreeLeafSlot(contract, slot).toBigInt();

    const lowLeafResult = await this.merkleDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);

    let value = Fr.ZERO;
    if (lowLeafResult && lowLeafResult.alreadyPresent) {
      const preimage = (await this.merkleDb.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      value = preimage.value;
    }
    return value;
  }

  override async storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<bigint> {
    await this.merkleDb.batchInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      [new PublicDataTreeLeaf(computePublicDataTreeLeafSlot(contract, slot), newValue).toBuffer()],
      0,
    );
    return newValue.toBigInt();
  }

  override checkpoint(): Promise<void> {
    return Promise.resolve();
  }
  override rollbackToCheckpoint(): Promise<void> {
    throw new Error('Cannot rollback');
  }
  override commit(): Promise<void> {
    return Promise.resolve();
  }
  override rollbackToCommit(): Promise<void> {
    throw new Error('Cannot rollback');
  }
}
