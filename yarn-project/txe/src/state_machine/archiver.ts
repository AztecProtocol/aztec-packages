import { ArchiverStoreHelper, KVArchiverDataStore, type PublishedL2Block } from '@aztec/archiver';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block, L2Tips } from '@aztec/stdlib/block';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockHeader } from '@aztec/stdlib/tx';

// We are extending the ArchiverDataStoreHelper here because it provides most of the endpoints needed by the
// node for reading from and writing to state, without needing any of the extra overhead that the Archiver itself
// requires (i.e. an L1 client)
export class TXEArchiver extends ArchiverStoreHelper {
  constructor(db: AztecAsyncKVStore) {
    super(new KVArchiverDataStore(db, 9999));
  }

  override async addBlocks(blocks: PublishedL2Block[]): Promise<boolean> {
    const opResults = await Promise.all([
      this.store.addLogs(blocks.map(block => block.block)),
      this.store.addBlocks(blocks),
    ]);

    return opResults.every(Boolean);
  }

  /**
   * Method to fetch the rollup contract address at the base-layer.
   * @returns The rollup address.
   */
  getRollupAddress(): Promise<EthAddress> {
    throw new Error('Not implemented');
  }

  /**
   * Method to fetch the registry contract address at the base-layer.
   * @returns The registry address.
   */
  getRegistryAddress(): Promise<EthAddress> {
    throw new Error('Not implemented');
  }

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns The number of the latest L2 block processed by the block source implementation.
   */
  getBlockNumber(): Promise<number> {
    return this.store.getSynchedL2BlockNumber();
  }

  /**
   * Gets the number of the latest L2 block proven seen by the block source implementation.
   * @returns The number of the latest L2 block proven seen by the block source implementation.
   */
  getProvenBlockNumber(): Promise<number> {
    return this.store.getSynchedL2BlockNumber();
  }

  /**
   * Gets an l2 block. If a negative number is passed, the block returned is the most recent.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  async getBlock(number: number): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number == 0) {
      return undefined;
    }
    const blocks = await this.store.getPublishedBlocks(number, 1);
    return blocks.length === 0 ? undefined : blocks[0].block;
  }

  /**
   * Gets an l2 block header.
   * @param number - The block number to return or 'latest' for the most recent one.
   * @returns The requested L2 block header.
   */
  public async getBlockHeader(number: number | 'latest'): Promise<BlockHeader | undefined> {
    if (number === 'latest') {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const headers = await this.store.getBlockHeaders(number, 1);
    return headers.length === 0 ? undefined : headers[0];
  }

  public getBlocks(from: number, limit: number, _proven?: boolean): Promise<L2Block[]> {
    return this.getPublishedBlocks(from, limit).then(blocks => blocks.map(b => b.block));
  }

  /**
   * Returns the current L2 slot number based on the current L1 timestamp.
   */
  getL2SlotNumber(): Promise<bigint> {
    throw new Error('Not implemented');
  }

  /**
   * Returns the current L2 epoch number based on the current L1 timestamp.
   */
  getL2EpochNumber(): Promise<bigint> {
    throw new Error('Not implemented');
  }

  /**
   * Returns all blocks for a given epoch.
   * @dev Use this method only with recent epochs, since it walks the block list backwards.
   * @param epochNumber - The epoch number to return blocks for.
   */
  getBlocksForEpoch(_epochNumber: bigint): Promise<L2Block[]> {
    throw new Error('Not implemented');
  }

  /**
   * Returns all block headers for a given epoch.
   * @dev Use this method only with recent epochs, since it walks the block list backwards.
   * @param epochNumber - The epoch number to return headers for.
   */
  getBlockHeadersForEpoch(_epochNumber: bigint): Promise<BlockHeader[]> {
    throw new Error('Not implemented');
  }

  /**
   * Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
   * @param epochNumber - The epoch number to check.
   */
  isEpochComplete(_epochNumber: bigint): Promise<boolean> {
    throw new Error('Not implemented');
  }

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips> {
    throw new Error('Not implemented');
  }

  /**
   * Returns the rollup constants for the current chain.
   */
  getL1Constants(): Promise<L1RollupConstants> {
    throw new Error('Not implemented');
  }

  /** Force a sync. */
  syncImmediate(): Promise<void> {
    throw new Error('Not implemented');
  }

  getContract(_address: AztecAddress, _blockNumber?: number): Promise<ContractInstanceWithAddress | undefined> {
    throw new Error('Not implemented');
  }
}
