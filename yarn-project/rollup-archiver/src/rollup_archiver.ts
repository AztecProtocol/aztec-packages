import { Address, createPublicClient, http, parseAbiItem, PublicClient } from 'viem';
import { localhost } from 'viem/chains';
import { createLogger } from './movetofoundation/log/console.js';
import { RollupBlockData } from './rollup_block_data/rollup_block_data.js';
import { RollupBlockSource } from './rollup_source.js';
import { State, Status } from './status.js';

/**
 * Pulls rollups in a non-blocking manner and provides interface for their retrieval.
 */
export class RollupArchiver implements Status, RollupBlockSource {
  /**
   * A logger.
   */
  private log = createLogger('Archiver');

  /**
   * An array containing all the rollups that have been fetched so far.
   */
  private rollupBlocks: RollupBlockData[] = [];

  /**
   * A client for interacting with the Ethereum node.
   */
  private client: PublicClient;

  private readonly blockEvent = parseAbiItem('event RollupBlockProcessed(uint256 indexed rollupBlockNumber)');
  private readonly yeetEvent = parseAbiItem(
    'event Yeet(uint256 indexed blockNum, address indexed sender, bytes blabber)',
  );

  private unwatchBlocks: (() => void) | undefined;
  private unwatchYeets: (() => void) | undefined;

  /**
   * Creates a new instance of the RollupArchiver.
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
   * {@inheritDoc Status.state}
   */
  public state(): State {
    return {
      syncedToBlock: this.getSyncedToBlockNum(),
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
      throw new Error('RollupArchiver is not running.');
    }

    this.unwatchBlocks();
    this.unwatchYeets();

    this.log('Stopped.');
  }

  /**
   * {@inheritDoc RollupBlockSource.getSyncedToBlockNum}
   */
  public getSyncedToBlockNum(): number {
    return this.rollupBlocks.length === 0 ? -1 : this.rollupBlocks[this.rollupBlocks.length - 1].rollupBlockNumber;
  }

  /**
   * {@inheritDoc RollupBlockSource.getRollupBlocks}
   */
  public getRollupBlocks(from: number, take: number): RollupBlockData[] {
    if (from > this.rollupBlocks.length) {
      const rollups: RollupBlockData[] = [];
      return rollups;
    }
    if (from + take > this.rollupBlocks.length) {
      return this.rollupBlocks.slice(from);
    }

    return this.rollupBlocks.slice(from, from + take);
  }

  /**
   * {@inheritDoc RollupBlockSource.getLastBlockNum}
   */
  public getLastBlockNum(): number {
    // TODO: fetch the last block number from the rollup contract
    return this.rollupBlocks.length + 100;
  }
}

// not bothering with docs since it will be removed once L1 JS lib is in place
// function mockRandomRollupBlock(rollupBlockNumber: number): RollupBlockData {
//   const newNullifiers = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
//   const newCommitments = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
//   const newContracts: Buffer[] = [randomBytes(32)];
//   const newContractsData: ContractData[] = [randomContractData()];

//   return new RollupBlockData(
//     rollupBlockNumber,
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
