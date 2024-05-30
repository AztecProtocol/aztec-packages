import { BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import { type ProcessedTx } from '@aztec/circuit-types';
import {
  type BlockResult,
  type ProverClient,
  type ProvingJobSource,
  type ProvingTicket,
  type ServerCircuitProver,
} from '@aztec/circuit-types/interfaces';
import { type Fr, type GlobalVariables, type VerificationKeys } from '@aztec/circuits.js';
import { NativeACVMSimulator } from '@aztec/simulator';
import { type WorldStateSynchronizer } from '@aztec/world-state';

import { type ProverClientConfig } from '../config.js';
import { ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import { MemoryProvingQueue } from '../prover-agent/memory-proving-queue.js';
import { ProverAgent } from '../prover-agent/prover-agent.js';

/**
 * A prover accepting individual transaction requests
 */
export class TxProver implements ProverClient {
  private orchestrator: ProvingOrchestrator;
  private queue = new MemoryProvingQueue();
  private running = false;

  constructor(
    private config: ProverClientConfig,
    private worldStateSynchronizer: WorldStateSynchronizer,
    private vks: VerificationKeys,
    private agent?: ProverAgent,
  ) {
    this.orchestrator = new ProvingOrchestrator(worldStateSynchronizer.getLatest(), this.queue);
  }

  async updateProverConfig(config: Partial<ProverClientConfig & { vks: VerificationKeys }>): Promise<void> {
    const newConfig = { ...this.config, ...config };

    if (config.vks) {
      this.vks = config.vks;
    }

    if (newConfig.realProofs !== this.config.realProofs && this.agent) {
      const circuitProver = await TxProver.buildCircuitProver(newConfig);
      this.agent.setCircuitProver(circuitProver);
    }

    if (this.config.proverAgentConcurrency !== newConfig.proverAgentConcurrency) {
      this.agent?.setMaxConcurrency(newConfig.proverAgentConcurrency);
    }

    this.config = newConfig;
  }

  /**
   * Starts the prover instance
   */
  public start() {
    if (this.running) {
      return Promise.resolve();
    }

    this.running = true;
    this.agent?.start(this.queue);
    return Promise.resolve();
  }

  /**
   * Stops the prover instance
   */
  public async stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    await this.agent?.stop();
  }

  /**
   * Creates a new prover client and starts it
   * @param config - The prover configuration.
   * @param vks - The verification keys for the prover
   * @param worldStateSynchronizer - An instance of the world state
   * @returns An instance of the prover, constructed and started.
   */
  public static async new(
    config: ProverClientConfig,
    vks: VerificationKeys,
    worldStateSynchronizer: WorldStateSynchronizer,
  ) {
    const agent = config.proverAgentEnabled
      ? new ProverAgent(
          await TxProver.buildCircuitProver(config),
          config.proverAgentConcurrency,
          config.proverAgentPollInterval,
        )
      : undefined;

    const prover = new TxProver(config, worldStateSynchronizer, vks, agent);
    await prover.start();
    return prover;
  }

  private static async buildCircuitProver(config: ProverClientConfig): Promise<ServerCircuitProver> {
    if (config.realProofs) {
      return await BBNativeRollupProver.new(config);
    }

    const simulationProvider = config.acvmBinaryPath
      ? new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath)
      : undefined;

    return new TestCircuitProver(simulationProvider);
  }

  /**
   * Cancels any block that is currently being built and prepares for a new one to be built
   * @param numTxs - The complete size of the block, must be a power of 2
   * @param globalVariables - The global variables for this block
   * @param l1ToL2Messages - The set of L1 to L2 messages to be included in this block
   * @param emptyTx - An instance of an empty transaction to be used in this block
   */
  public async startNewBlock(
    numTxs: number,
    globalVariables: GlobalVariables,
    newL1ToL2Messages: Fr[],
    emptyTx: ProcessedTx,
  ): Promise<ProvingTicket> {
    const previousBlockNumber = globalVariables.blockNumber.toNumber() - 1;
    await this.worldStateSynchronizer.syncImmediate(previousBlockNumber);
    return this.orchestrator.startNewBlock(numTxs, globalVariables, newL1ToL2Messages, emptyTx, this.vks);
  }

  /**
   * Add a processed transaction to the current block
   * @param tx - The transaction to be added
   */
  public addNewTx(tx: ProcessedTx): Promise<void> {
    return this.orchestrator.addNewTx(tx);
  }

  /**
   * Cancels the block currently being proven. Proofs already bring built may continue but further proofs should not be started.
   */
  public cancelBlock(): void {
    this.orchestrator.cancelBlock();
  }

  /**
   * Performs the final archive tree insertion for this block and returns the L2Block and Proof instances
   */
  public finaliseBlock(): Promise<BlockResult> {
    return this.orchestrator.finaliseBlock();
  }

  /**
   * Mark the block as having all the transactions it is going to contain.
   * Will pad the block to it's complete size with empty transactions and prove all the way to the root rollup.
   */
  public setBlockCompleted(): Promise<void> {
    return this.orchestrator.setBlockCompleted();
  }

  public getProvingJobSource(): ProvingJobSource {
    return this.queue;
  }
}
