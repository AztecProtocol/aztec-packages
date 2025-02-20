import { MerkleTreeId } from '@aztec/circuit-types';
import type { MerkleTreeWriteOperations } from '@aztec/circuit-types/interfaces/server';
import { Fr, PublicDataWrite } from '@aztec/circuits.js';
import type { AztecAddress, ContractDataSource } from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import type { PublicDataTreeLeafPreimage } from '@aztec/circuits.js/trees';
import { WorldStateDB } from '@aztec/simulator/server';

import type { TXE } from '../oracle/txe_oracle.js';

export class TXEWorldStateDB extends WorldStateDB {
  constructor(private merkleDb: MerkleTreeWriteOperations, dataSource: ContractDataSource, private txe: TXE) {
    super(merkleDb, dataSource);
  }

  override async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const leafSlot = (await computePublicDataTreeLeafSlot(contract, slot)).toBigInt();

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
    await this.txe.addPublicDataWrites([
      new PublicDataWrite(await computePublicDataTreeLeafSlot(contract, slot), newValue),
    ]);

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
