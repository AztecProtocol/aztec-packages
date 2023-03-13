import { Address, createPublicClient, http, parseAbiItem, PublicClient } from 'viem';
import { localhost } from 'viem/chains';
import { L2BlockData } from './l2_block_data/l2_block_data.js';
import { L2BlockSource, SyncStatus } from './l2_block_source.js';
import { createLogger } from './movetofoundation/log/console.js';

/**
 * Pulls L2 blocks in a non-blocking manner and provides interface for their retrieval.
 */
export class DataArchiver implements L2BlockSource {
  /**
   * A logger.
   */
  private log = createLogger('Archiver');

  /**
   * An array containing all the L2 blocks that have been fetched so far.
   */
  private l2Blocks: L2BlockData[] = [];

  /**
   * A client for interacting with the Ethereum node.
   */
  private client: PublicClient;

  private readonly blockEvent = parseAbiItem('event L2BlockProcessed(uint256 indexed blockNum)');
  private readonly yeetEvent = parseAbiItem(
    'event Yeet(uint256 indexed blockNum, address indexed sender, bytes blabber)',
  );

  private unwatchBlocks: (() => void) | undefined;
  private unwatchYeets: (() => void) | undefined;

  /**
   * Creates a new instance of the DataArchiver.
   * @param ethereumHost - Ethereum provider
   * @param rollupAddress - Ethereum address of the rollup contract
   * @param yeeterAddress - Ethereum address of the yeeter contract
   * TODO: replace strings with the corresponding types once they are implemented in ethereum.js
   */
  constructor(
    private readonly ethereumHost: string,
    private readonly rollupAddress: Address,
    private readonly yeeterAddress: Address,
  ) {
    this.client = createPublicClient({
      chain: localhost,
      transport: http(ethereumHost),
    });
  }

  /**
   * {@inheritDoc L2BlockSource.getSyncStatus}
   */
  public getSyncStatus(): SyncStatus {
    return {
      syncedToBlock: -1, // TODO: fetch directly from contract
      latestBlock: this.getLastBlockNum(),
    };
  }

  /**
   * Starts the promise pulling the data.
   */
  public async start() {
    this.log(
      'Initializing with provider: ' +
        this.ethereumHost +
        ' and rollup contract address: ' +
        this.rollupAddress +
        '...',
    );

    await this.runInitialSync();
    this.log('Initial sync finished.');
    this.startWatchingEvents();
    this.log('Watching for new data...');
  }

  private async runInitialSync() {
    const blockFilter = await this.client.createEventFilter({
      address: this.rollupAddress,
      fromBlock: 0n,
      event: this.blockEvent,
    });

    const yeetFilter = await this.client.createEventFilter({
      address: this.yeeterAddress,
      event: this.yeetEvent,
      fromBlock: 0n,
    });

    const blockLogs = await this.client.getFilterLogs({ filter: blockFilter });
    const yeetLogs = await this.client.getFilterLogs({ filter: yeetFilter });

    this.processBlockLogs(blockLogs);
    this.processYeetLogs(yeetLogs);
  }

  private startWatchingEvents() {
    this.unwatchBlocks = this.client.watchEvent({
      address: this.rollupAddress,
      event: this.blockEvent,
      onLogs: logs => this.processBlockLogs(logs),
    });

    this.unwatchYeets = this.client.watchEvent({
      address: this.yeeterAddress,
      event: this.yeetEvent,
      onLogs: logs => this.processYeetLogs(logs),
    });
  }

  private processBlockLogs(logs: any[]) {
    this.log('Processed ' + logs.length + ' L2 blocks...');
  }

  private processYeetLogs(logs: any[]) {
    this.log('Processed ' + logs.length + ' yeets...');
  }

  /**
   * Stops the promise pulling the data.
   */
  public stop() {
    this.log('Stopping...');
    if (this.unwatchBlocks === undefined || this.unwatchYeets === undefined) {
      throw new Error('DataArchiver is not running.');
    }

    this.unwatchBlocks();
    this.unwatchYeets();

    this.log('Stopped.');
  }

  /**
   * {@inheritDoc L2BlockSource.getL2Blocks}
   */
  public getL2Blocks(from: number, take: number): L2BlockData[] {
    if (from > this.l2Blocks.length) {
      return [];
    }
    if (from + take > this.l2Blocks.length) {
      return this.l2Blocks.slice(from);
    }

    return this.l2Blocks.slice(from, from + take);
  }

  /**
   * {@inheritDoc L2BlockSource.getLatestBlockNum}
   */
  public getLatestBlockNum(): number {
    // TODO: fetch the last block number from the rollup contract
    return this.l2Blocks.length;
  }
}

// not bothering with docs since it will be removed once L1 JS lib is in place
// function mockRandomL2Block(l2BlockNum: number): L2BlockData {
//   const newNullifiers = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
//   const newCommitments = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
//   const newContracts: Buffer[] = [randomBytes(32)];
//   const newContractsData: ContractData[] = [randomContractData()];

//   return new L2BlockData(
//     l2BlockNum,
//     randomAppendOnlyTreeSnapshot(0),
//     randomAppendOnlyTreeSnapshot(0),
//     randomAppendOnlyTreeSnapshot(0),
//     randomAppendOnlyTreeSnapshot(0),
//     randomAppendOnlyTreeSnapshot(0),
//     randomAppendOnlyTreeSnapshot(newCommitments.length),
//     randomAppendOnlyTreeSnapshot(newNullifiers.length),
//     randomAppendOnlyTreeSnapshot(newContracts.length),
//     randomAppendOnlyTreeSnapshot(1),
//     randomAppendOnlyTreeSnapshot(1),
//     newCommitments,
//     newNullifiers,
//     newContracts,
//     newContractsData,
//   );
// }
