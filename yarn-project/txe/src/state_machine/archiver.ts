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

  public override async addBlocks(blocks: PublishedL2Block[]): Promise<boolean> {
    const opResults = await Promise.all([
      this.store.addLogs(blocks.map(block => block.block)),
      this.store.addBlocks(blocks),
    ]);

    return opResults.every(Boolean);
  }

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns The number of the latest L2 block processed by the block source implementation.
   */
  public getBlockNumber(): Promise<number> {
    return this.store.getSynchedL2BlockNumber();
  }

  /**
   * Gets the number of the latest L2 block proven seen by the block source implementation.
   * @returns The number of the latest L2 block proven seen by the block source implementation.
   */
  public getProvenBlockNumber(): Promise<number> {
    return this.store.getSynchedL2BlockNumber();
  }

  /**
   * Gets a published l2 block. If a negative number is passed, the block returned is the most recent.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  public override async getPublishedBlock(number: number): Promise<PublishedL2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number == 0) {
      return undefined;
    }
    const blocks = await this.store.getPublishedBlocks(number, 1);
    return blocks.length === 0 ? undefined : blocks[0];
  }

  /**
   * Gets an l2 block. If a negative number is passed, the block returned is the most recent.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  public getBlock(number: number): Promise<L2Block | undefined> {
    return this.getPublishedBlock(number).then(block => block?.block);
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

  public getL2SlotNumber(): Promise<bigint> {
    throw new Error('TXE Archiver does not implement "getL2SlotNumber"');
  }

  public getL2EpochNumber(): Promise<bigint> {
    throw new Error('TXE Archiver does not implement "getL2EpochNumber"');
  }

  public getBlocksForEpoch(_epochNumber: bigint): Promise<L2Block[]> {
    throw new Error('TXE Archiver does not implement "getBlocksForEpoch"');
  }

  public getBlockHeadersForEpoch(_epochNumber: bigint): Promise<BlockHeader[]> {
    throw new Error('TXE Archiver does not implement "getBlockHeadersForEpoch"');
  }

  public isEpochComplete(_epochNumber: bigint): Promise<boolean> {
    throw new Error('TXE Archiver does not implement "isEpochComplete"');
  }

  public getL2Tips(): Promise<L2Tips> {
    throw new Error('TXE Archiver does not implement "getL2Tips"');
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    throw new Error('TXE Archiver does not implement "getL2Constants"');
  }

  public syncImmediate(): Promise<void> {
    throw new Error('TXE Archiver does not implement "syncImmediate"');
  }

  public async getContract(address: AztecAddress, blockNumber?: number): Promise<ContractInstanceWithAddress | undefined> {
    // TXE Archiver currently operates on latest state only
    // blockNumber parameter is accepted for interface compliance but ignored
    // TODO: Implement historical state queries if needed for TXE
    const effectiveBlockNumber = blockNumber ?? (await this.getBlockNumber());
    return this.getContractInstance(address, effectiveBlockNumber);
  }

  public getRollupAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRollupAddress"');
  }

  public getRegistryAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRegistryAddress"');
  }

  public getL1Timestamp(): Promise<bigint> {
    throw new Error('TXE Archiver does not implement "getL1Timestamp"');
  }
}
