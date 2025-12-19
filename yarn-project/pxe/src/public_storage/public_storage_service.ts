import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockParameter } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';

import type { AnchorBlockDataProvider } from '../storage/index.js';

export class PublicStorageService {
  constructor(
    private readonly anchorBlockDataProvider: AnchorBlockDataProvider,
    private readonly aztecNode: AztecNode,
  ) {}

  public async getPublicStorageAt(blockNumber: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
    if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }
    return await this.aztecNode.getPublicStorageAt(blockNumber, contract, slot);
  }
}
