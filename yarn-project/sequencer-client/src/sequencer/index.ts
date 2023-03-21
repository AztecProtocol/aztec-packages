import { mockRandomL2Block } from "@aztec/archiver";
import { RollupEmitter } from "../deps/archiver.js";
import { P2P, Tx } from "../deps/p2p.js";
import { RunningPromise } from "../deps/running_promise.js";
import { L2BlockPublisher } from "../publisher/l2-block-publisher.js";

/**
 * Sequencer client
 * - Wins a period of time to become the sequencer (depending on finalised protocol).
  * - Chooses a set of txs from the tx pool to be in the rollup.
  * - Simulate the rollup of txs.
  * - Adds proof requests to the request pool (not for this milestone).
  * - Receives results to those proofs from the network (repeats as necessary) (not for this milestone).
  * - Publishes L1 tx(s) to the rollup contract via RollupPublisher.
  * - For this milestone, the sequencer will just simulate and publish a 1x1 rollup and publish it to L1.
 */
export class Sequencer {
  private runningPromise?: RunningPromise;
  private intervalMs: number;
  private lastBlockNumber: number = 0;
  private state = SequencerRunningState.STOPPED;

  constructor(
    private rollupEmitter: RollupEmitter,
    private publisher: L2BlockPublisher,
    private p2pClient: P2P,
    opts?: { intervalMs?: number }
  ) {
    this.intervalMs = opts?.intervalMs ?? 1_000;
  }

  public async start() {
    this.lastBlockNumber = await this.getLastBlockNumber();
    this.runningPromise = new RunningPromise(this.work.bind(this), { pollingInterval: this.intervalMs, includeRunningTime: true });
    this.runningPromise.start();
    this.state = SequencerRunningState.IDLE;
  }
  
  // TODO: Load from worldstatesyncer?
  private async getLastBlockNumber(): Promise<number> {
    return 1;
  }

  public async stop(): Promise<void> {
    await this.runningPromise?.stop();
    this.publisher.interrupt();
    this.state = SequencerRunningState.STOPPED;
  }

  public status() {
    return { state: this.state };
  }

  /**
   * Grabs a single tx from the p2p client, constructs a block, and pushes it to L1
   */
  protected async work() {
    try {
      await this.waitForSync();

      const [tx] = this.p2pClient.getTxs();
      if (!tx) {
        this.log(`No txs seen in the mempool`);
        return;
      } else {
        this.log(`Processing tx ${tx.txId}`);
      }

      const block = await this.buildBlock(tx);
      this.log(`Assembled block ${block.number}`);

      const published = await this.publisher.processL2Block(block);
      if (published) {
        this.log(`Successfully published block ${block.number}`);
      }
    } catch (err) {
      console.error(`Error doing work`, err);
    }
  }

  // TODO: Implement me
  protected async waitForSync() {

  }

  protected async buildBlock(tx: Tx) {
    return mockRandomL2Block(++this.lastBlockNumber);
  }

  // TODO: Is there a unified logging interface?
  private log(message: string, ...optionalParams: any[]) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Sequencer:`, message, ...optionalParams);
    }
  }
}

export enum SequencerRunningState {
  IDLE,
  CREATING_BLOCK,
  PUBLISHING_BLOCK,
  STOPPED,
}