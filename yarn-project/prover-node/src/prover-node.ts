import { type L2BlockSource, type ProverClient, type TxProvider } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type L1Publisher } from '@aztec/sequencer-client';
import { type PublicProcessorFactory } from '@aztec/simulator';

import { BlockProvingJob } from './job/block-proving-job.js';

export class ProverNode {
  private log = createDebugLogger('aztec:prover-node');

  constructor(
    private prover: ProverClient,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: L1Publisher,
    private l2BlockSource: L2BlockSource,
    private txProvider: TxProvider,
  ) {}

  async stop() {
    this.log.info('Stopping ProverNode');
    await this.prover.stop();
    await this.l2BlockSource.stop();
    // TODO: Should we stop the L1Publisher as well?
    this.log.info('Stopped ProverNode');
  }

  /**
   * Creates a proof for a block range. Returns once the proof has been submitted to L1.
   */
  public prove(fromBlock: number, toBlock: number) {
    return this.createProvingJob().run(fromBlock, toBlock);
  }

  /**
   * Starts a proving process and returns immediately.
   */
  public startProof(fromBlock: number, toBlock: number) {
    void this.createProvingJob().run(fromBlock, toBlock);
    return Promise.resolve();
  }

  private createProvingJob() {
    return new BlockProvingJob(
      this.prover,
      this.publicProcessorFactory,
      this.publisher,
      this.l2BlockSource,
      this.txProvider,
    );
  }
}
