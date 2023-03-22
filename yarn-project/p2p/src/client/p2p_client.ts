import { L2Block, L2BlockSource, L2BlockDownloader } from '@aztec/archiver';

import { InMemoryTxPool } from '../tx_pool/memory_tx_pool.js';
import { TxPool } from '../tx_pool/index.js';
import { AccumulatedTxData, Tx } from './tx.js';

const TAKE_NUM = 10;

/**
 * Enum defining the possible states of the p2p client.
 */
enum P2PClientState {
  IDLE,
  SYNCHING,
  RUNNING,
  STOPPED,
}

/**
 * Interface of a P2P client.
 **/
export interface P2P {
  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   **/
  sendTx(tx: Tx): Promise<void>;

  /**
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  getTxs(): Promise<Tx[]>;

  /**
   * Starts the p2p client.
   * @returns A promise signalling the completion of the block sync.
   */
  start(): Promise<void>;

  /**
   * Stops the p2p client.
   * @returns A promise signalling the completion of the stop process.
   */
  stop(): Promise<void>;
}

/**
 * The P2P client implementation.
 */
export class P2PCLient implements P2P {
  /**
   * L2 Block download that p2p client uses to stay in sync with latest blocks.
   */
  private blockDownloader: L2BlockDownloader;

  /**
   * Property that indicates whether the client is running.
   */
  private stopping = false;

  /**
   * The JS promise that will be running to keep the client's data in sync. Can be interrupted if the client is stopped.
   */
  private runningSyncPromise!: Promise<void>;

  /**
   * Store the ID of the latest block the client has synced to.
   */
  private syncedBlockNum = -1;

  private currentState = P2PClientState.IDLE;
  private syncPromise = Promise.resolve();
  private latestBlockNumberAtStart = -1;
  private syncResolve?: () => void = undefined;

  /**
   * In-memory P2P client constructor.
   * @param l2BlockSource - P2P client's source for fetching existing block data.
   * @param txPool - The client's instance of a transaction pool. Defaults to in-memory implementation.
   */
  constructor(private l2BlockSource: L2BlockSource, private txPool: TxPool = new InMemoryTxPool()) {
    this.blockDownloader = new L2BlockDownloader(l2BlockSource, TAKE_NUM);
  }

  /**
   * Starts the P2P client.
   * @returns An empty promise signalling the synching process.
   */
  public async start() {
    if (this.currentState === P2PClientState.STOPPED) {
      throw new Error('P2P client already stopped');
    }
    if (this.currentState !== P2PClientState.IDLE) {
      return this.syncPromise;
    }

    // get the current latest block number
    this.latestBlockNumberAtStart = await this.l2BlockSource.getLatestBlockNum();

    if (this.syncedBlockNum >= this.latestBlockNumberAtStart) {
      // if no blocks to be retrieved, go straight to running
      this.currentState = P2PClientState.RUNNING;
      this.syncPromise = Promise.resolve();
    } else {
      this.currentState = P2PClientState.SYNCHING;
      this.syncPromise = new Promise(resolve => {
        this.syncResolve = resolve;
      });
    }

    // start looking for further blocks
    const blockProcess = async () => {
      while (!this.stopping) {
        const blocks = await this.blockDownloader.getL2Blocks();
        await this.processBlocks(blocks);
      }
    };
    this.runningSyncPromise = blockProcess();
    this.blockDownloader.start(this.syncedBlockNum + 1);
    return this.syncPromise;
  }

  /**
   * Allows consumers to stop the instance of the P2P client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.stopping = true;
    await this.blockDownloader.stop();
    await this.runningSyncPromise;
    this.currentState = P2PClientState.STOPPED;
  }

  /**
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  public getTxs(): Promise<Tx[]> {
    return Promise.resolve(this.txPool.getAllTxs());
  }

  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The tx to verify.
   * @returns Empty promise.
   **/
  public sendTx(tx: Tx): Promise<void> {
    if (this.isReady()) {
      this.txPool.addTxs([tx]);
    }
    return Promise.resolve();
  }

  /**
   * Public function to check if the p2p client is fully synced and ready to receive txs.
   * @returns True if the P2P client is ready to receive txs.
   */
  public isReady() {
    return this.currentState === P2PClientState.RUNNING;
  }

  /**
   * Public function to check the latest block number that the P2P client is synced to.
   * @returns Block number of latest L2 Block we've synced with.
   */
  public getSyncedBlockNum() {
    return this.syncedBlockNum;
  }

  /**
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: state & syncedToBlockNum.
   */
  public getStatus() {
    return {
      state: this.currentState,
      syncedToBlockNum: this.syncedBlockNum,
    };
  }

  /**
   * Internal method that uses the provided blocks to check against the client's tx pool.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private reconcileTxPool(blocks: L2Block[]): Promise<void> {
    for (let i = 0; i < blocks.length; i++) {
      const { newContracts } = blocks[i];
      this.txPool.deleteTxs(newContracts?.map((data: Buffer) => AccumulatedTxData.createTxId(data)) || []);
    }
    return Promise.resolve();
  }

  /**
   * Method for processing new blocks.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private async processBlocks(blocks: L2Block[]): Promise<void> {
    if (!blocks.length) {
      return Promise.resolve();
    }
    await this.reconcileTxPool(blocks);
    this.syncedBlockNum = blocks[blocks.length - 1].number;
    if (this.currentState === P2PClientState.SYNCHING && this.syncedBlockNum >= this.latestBlockNumberAtStart) {
      this.currentState = P2PClientState.RUNNING;
      if (this.syncResolve !== undefined) {
        this.syncResolve();
      }
    }
  }
}
