import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockParameter } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';

import type { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';

export class PublicStorageService {
  constructor(
    private readonly anchorBlockStore: AnchorBlockStore,
    private readonly aztecNode: AztecNode,
  ) {}

  /**
   * Gets the storage value at the given contract storage slot.
   *
   * @remarks The storage slot here refers to the slot as it is defined in Noir not the index in the merkle tree.
   * Aztec's version of `eth_getStorageAt`.
   *
   * @param blockNumber - The block number at which to get the data.
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @returns Storage value at the given contract slot.
   * @throws If the contract is not deployed.
   */
  public async getPublicStorageAt(blockNumber: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    const anchorBlockNumber = (await this.anchorBlockStore.getBlockHeader()).getBlockNumber();
    if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
      throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
    }
    return await this.aztecNode.getPublicStorageAt(blockNumber, contract, slot);
  }
}
