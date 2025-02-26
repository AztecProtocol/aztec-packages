import { Fr } from '@aztec/foundation/fields';
import { WorldStateDB } from '@aztec/simulator/server';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId, type PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';

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

  override async storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<void> {
    await this.txe.addPublicDataWrites([
      new PublicDataWrite(await computePublicDataTreeLeafSlot(contract, slot), newValue),
    ]);
  }
}
