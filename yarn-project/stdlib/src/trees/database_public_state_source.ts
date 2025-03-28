import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';
import { computePublicDataTreeLeafSlot } from '../hash/hash.js';
import type { MerkleTreeReadOperations } from '../interfaces/merkle_tree_operations.js';
import type { PublicStateSource } from '../interfaces/public_state_source.js';
import { MerkleTreeId } from './merkle_tree_id.js';
import type { PublicDataTreeLeafPreimage } from './public_data_leaf.js';

export type { PublicStateSource };

export class DatabasePublicStateSource implements PublicStateSource {
  constructor(private db: MerkleTreeReadOperations) {}

  async storageRead(contractAddress: AztecAddress, slot: Fr): Promise<Fr> {
    const leafSlot = (await computePublicDataTreeLeafSlot(contractAddress, slot)).toBigInt();

    const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }

    const preimage = (await this.db.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    return preimage.leaf.value;
  }
}
