import { Fr } from '@aztec/foundation/fields';
import { PublicTreesDB } from '@aztec/simulator/server';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';

import type { TXE } from '../oracle/txe_oracle.js';

export class TXEPublicTreesDB extends PublicTreesDB {
  constructor(merkleDb: MerkleTreeWriteOperations, private txe: TXE) {
    super(merkleDb);
  }

  override async storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<void> {
    // This adds the write to the TXE's public data writes, and also writes to the merkle tree.
    await this.txe.addPublicDataWrites([
      new PublicDataWrite(await computePublicDataTreeLeafSlot(contract, slot), newValue),
    ]);
  }
}
