import { InterruptableSleep } from '@aztec/foundation';
import { L2Block, L2BlockSource, L2BlockDownloader } from '@aztec/archiver';

import { InMemoryTxPool } from '../tx_pool/memory_tx_pool.js';
import { P2P } from './p2p_client.js';
import { TxPool } from '../tx_pool/index.js';
import { Tx } from './temp_types.js';
import { AccumulatedTxData } from './tx.js';

const TAKE_NUM = 10;

/**
 * Enum defining the possible states of the p2p client.
 */
enum P2PClientState {
  IDLE,
  SYNCING,
  RUNNING,
  STOPPED,
}

/**
 * An in-memory implementation of the P2P client.
 */
export class InMemoryP2PCLient implements P2P {
  /**
   * L2 Block download that p2p client uses to stay in sync with latest blocks.
   */
  private blockDownloader: L2BlockDownloader;

  /**
   * Property that indicates whether the client is running.
   */
  private running = false;

  /**
   * Property that indicates whether the client is ready to receive new txs.
   */
  private ready = false;

  /**
   * The JS promise that will be running to keep the client's data in sync. Can be interrupted if the client is stopped.
   */
  private runningSyncPromise!: Promise<void>;

  /**
   * A function that waits for a specified time or until it's interrupted.
   */
  private interruptableSleep = new InterruptableSleep();

  /**
   * Store the ID of the latest block the client has synced to.
   */
  private syncedBlockNum = 0;

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
   */
  public async start() {
    this.running = true;

    let synced = false;

    const latestBlockNum = await this.l2BlockSource.getLatestBlockNum();

    const txPoolSize = this.txPool.getAllTxs().keys.length;
    if (!txPoolSize) {
      // No initial reconciliation needed, proceed;
      synced = true;
      this.syncedBlockNum = latestBlockNum;
      // start block downloader from latest L2 Block ID
      this.blockDownloader.start(latestBlockNum);
    }

    while (!synced) {
      // start block downloader from the beginning
      this.blockDownloader.start();
      const blocks = await this.blockDownloader.getL2Blocks();
      this.reconcileTxPool(blocks);

      if (blocks.length) {
        this.syncedBlockNum = blocks[blocks.length - 1].number;
      } else {
        synced = true;
        this.syncedBlockNum = latestBlockNum;
      }
    }
    this.ready = true;

    const runningSyncPromise = async () => {
      while (this.running) {
        const newBlocks = await this.blockDownloader.getL2Blocks();
        if (newBlocks.length) {
          this.reconcileTxPool(newBlocks);
        } else {
          await this.interruptableSleep.sleep(10000);
        }
      }
    };

    this.runningSyncPromise = runningSyncPromise();
  }

  /**
   * Allows consumers to stop the instance of the P2P client.
   * 'running' & 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.running = false;
    this.ready = false;
    await this.blockDownloader.stop();
    this.interruptableSleep.interrupt();
    await this.runningSyncPromise;
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
    if (this.ready && this.running) {
      this.txPool.addTxs([tx]);
    }
    return Promise.resolve();
  }

  /**
   * Public function to check if P2P client is currently running.
   * @returns True if the P2P client is running.
   */
  public isRunning() {
    return this.running;
  }

  /**
   * Public function to check if the p2p client is fully synced and ready to receive txs.
   * @returns True if the P2P client is ready to receive txs.
   */
  public isReady() {
    return this.ready;
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
    let clientState = P2PClientState.IDLE;
    if (this.ready) {
      clientState = P2PClientState.RUNNING;
    } else if (this.running) {
      clientState = P2PClientState.SYNCING;
    }

    return {
      state: clientState,
      syncedToBlockNum: this.syncedBlockNum,
    };
  }

  /**
   * Internal method that uses the provided blocks to check against the client's tx pool.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   */
  private reconcileTxPool(blocks: L2Block[]) {
    for (let i = 0; i < blocks.length; i++) {
      const { newContracts } = blocks[i];
      this.txPool.deleteTxs(newContracts?.map((data: Buffer) => AccumulatedTxData.createTxId(data)) || []);
    }
  }
}
