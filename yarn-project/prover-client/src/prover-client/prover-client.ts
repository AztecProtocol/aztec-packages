import { type ACVMConfig, type BBConfig, BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { NativeACVMSimulator } from '@aztec/simulator/server';
import {
  type ActualProverConfig,
  type EpochProverManager,
  type ForkMerkleTreeOperations,
  type ProvingJobBroker,
  type ProvingJobConsumer,
  type ProvingJobProducer,
  type ReadonlyWorldStateAccess,
  type ServerCircuitProver,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { InboxMessageBundle } from '@aztec/stdlib/messaging';
import type { CheckpointConstantData } from '@aztec/stdlib/rollup';
import type { BlockHeader } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { ProverClientConfig } from '../config.js';
import { CheckpointSubTreeOrchestrator } from '../orchestrator/checkpoint-sub-tree-orchestrator.js';
import type { ChonkCache } from '../orchestrator/chonk-cache.js';
import { TopTreeOrchestrator } from '../orchestrator/top-tree-orchestrator.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { InlineProofStore, type ProofStore, createProofStore } from '../proving_broker/proof_store/index.js';
import { ProvingAgent } from '../proving_broker/proving_agent.js';

/**
 * The factory surface that `EpochProvingJob` (in `prover-node`) depends on. Implemented
 * by `ProverClient`. Defined here rather than in stdlib because the return types
 * (`CheckpointSubTreeOrchestrator`, `TopTreeOrchestrator`) are concrete classes from
 * this package.
 *
 * A single `BrokerCircuitProverFacade` is owned by `ProverClient` and shared across
 * every orchestrator (every sub-tree and every top-tree across every concurrent epoch
 * job). The broker delivers each completed-job notification exactly once (drained on
 * the first `getCompletedJobs` poll), so multiple facades polling the same broker
 * race and lose notifications
 *
 * The facade's job map cleans up entries on resolve/reject, and the prover-node
 * keeps `ProverClient` alive for its whole lifetime
 */
export interface EpochProverFactory {
  getProverId(): EthAddress;
  /**
   * Constructs and starts a `CheckpointSubTreeOrchestrator` for a single checkpoint
   * against the supplied shared `chonkCache`. The cache is owned by the prover-node
   * and survives across epochs / sessions.
   */
  createCheckpointSubTreeOrchestrator(
    chonkCache: ChonkCache,
    epochNumber: EpochNumber,
    checkpointConstants: CheckpointConstantData,
    l1ToL2Messages: InboxMessageBundle,
    startInboxRollingHash: Fr,
    totalNumBlocks: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ): Promise<CheckpointSubTreeOrchestrator>;
  createTopTreeOrchestrator(): TopTreeOrchestrator;
}

/** Manages proving of epochs by orchestrating the proving of individual blocks relying on a pool of prover agents. */
export class ProverClient implements EpochProverManager, EpochProverFactory {
  private running = false;
  private agents: ProvingAgent[] = [];
  /**
   * The single broker facade shared by every orchestrator created from this client.
   * Constructed lazily on `start()` and torn down on `stop()` — see the comment on
   * `EpochProverFactory` for why a single shared facade is required.
   */
  private facade: BrokerCircuitProverFacade | undefined;
  /**
   * Single deferred-proving-job queue shared across every orchestrator (sub-trees and
   * top-trees, across every concurrent epoch session). Throttles the total rate of job
   * submission to the broker once, rather than once per orchestrator. Started lazily
   * alongside the facade and cancelled on `stop()`.
   */
  private deferredJobQueue: SerialQueue | undefined;

  private constructor(
    private config: ProverClientConfig,
    private worldState: ForkMerkleTreeOperations & ReadonlyWorldStateAccess,
    private orchestratorClient: ProvingJobProducer,
    private proofStore: ProofStore,
    private failedProofStore: ProofStore | undefined,
    private agentClient?: ProvingJobConsumer,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log: Logger = createLogger('prover-client:tx-prover'),
  ) {}

  /**
   * Lazy-init the shared facade. The broker delivers each completed-job notification
   * exactly once (drained on the first `getCompletedJobs` poll), so we cannot start
   * a shared facade alongside the per-call facades that `createEpochProver` builds —
   * they would race for notifications and one side would silently drop them. Starting
   * the shared facade only on first use of one of the new factory methods keeps the
   * legacy `createEpochProver` path race-free.
   */
  private getFacade(): BrokerCircuitProverFacade {
    if (!this.running) {
      throw new Error('ProverClient is not running; call start() before constructing orchestrators.');
    }
    if (!this.facade) {
      this.facade = new BrokerCircuitProverFacade(
        this.orchestratorClient,
        this.proofStore,
        this.failedProofStore,
        undefined,
        this.log.getBindings(),
      );
      this.facade.start();
    }
    return this.facade;
  }

  /** Lazy-init the shared deferred-job queue, started with the configured enqueue concurrency. */
  private getDeferredJobQueue(): SerialQueue {
    if (!this.running) {
      throw new Error('ProverClient is not running; call start() before constructing orchestrators.');
    }
    if (!this.deferredJobQueue) {
      this.deferredJobQueue = new SerialQueue();
      this.deferredJobQueue.start(this.config.enqueueConcurrency);
    }
    return this.deferredJobQueue;
  }

  public createCheckpointSubTreeOrchestrator(
    chonkCache: ChonkCache,
    epochNumber: EpochNumber,
    checkpointConstants: CheckpointConstantData,
    l1ToL2Messages: InboxMessageBundle,
    startInboxRollingHash: Fr,
    totalNumBlocks: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ): Promise<CheckpointSubTreeOrchestrator> {
    return CheckpointSubTreeOrchestrator.start(
      this.worldState,
      this.getFacade(),
      this.config.proverId,
      chonkCache,
      epochNumber,
      this.config.cancelJobsOnStop,
      this.getDeferredJobQueue(),
      checkpointConstants,
      l1ToL2Messages,
      startInboxRollingHash,
      totalNumBlocks,
      headerOfLastBlockInPreviousCheckpoint,
      this.telemetry,
      this.log.getBindings(),
    );
  }

  public createTopTreeOrchestrator(): TopTreeOrchestrator {
    return new TopTreeOrchestrator(
      this.getFacade(),
      this.config.proverId,
      this.getDeferredJobQueue(),
      this.telemetry,
      this.log.getBindings(),
    );
  }

  public getProverId(): EthAddress {
    return this.config.proverId;
  }

  async updateProverConfig(config: Partial<ProverClientConfig>): Promise<void> {
    const newConfig = { ...this.config, ...config };

    if (
      newConfig.realProofs !== this.config.realProofs ||
      newConfig.proverAgentCount !== this.config.proverAgentCount
    ) {
      await this.stopAgents();
      await this.createAndStartAgents();
    }

    this.config = newConfig;
  }

  /**
   * Starts the prover instance
   */
  public async start(): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }

    this.running = true;
    await this.createAndStartAgents();
  }

  /**
   * Stops the prover instance
   */
  public async stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    await this.stopAgents();
    if (this.deferredJobQueue) {
      await this.deferredJobQueue.cancel();
      this.deferredJobQueue = undefined;
    }
    if (this.facade) {
      await tryStop(this.facade, this.log);
      this.facade = undefined;
    }
    await tryStop(this.orchestratorClient);
  }

  /**
   * Creates a new prover client and starts it
   * @param config - The prover configuration.
   * @param worldState - An instance of the world state
   * @returns An instance of the prover, constructed and started.
   */
  public static async new(
    config: ProverClientConfig,
    worldState: ForkMerkleTreeOperations & ReadonlyWorldStateAccess,
    broker: ProvingJobBroker,
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    const proofStore = await createProofStore(config.proofStore);
    const failedProofStore = config.failedProofStore ? await createProofStore(config.failedProofStore) : undefined;
    const prover = new ProverClient(config, worldState, broker, proofStore, failedProofStore, broker, telemetry);
    await prover.start();
    return prover;
  }

  public getProvingJobSource(): ProvingJobConsumer {
    if (!this.agentClient) {
      throw new Error('Agent client not provided');
    }

    return this.agentClient;
  }

  private async createAndStartAgents(): Promise<void> {
    if (this.agents.length > 0) {
      throw new Error('Agents already started');
    }

    if (!this.agentClient) {
      throw new Error('Agent client not provided');
    }

    const proofStore = new InlineProofStore();
    const prover = await buildServerCircuitProver(this.config, this.telemetry);
    const bindings = this.log.getBindings();
    this.agents = times(
      this.config.proverAgentCount,
      () =>
        new ProvingAgent(this.agentClient!, proofStore, prover, [], this.config.proverAgentPollIntervalMs, bindings),
    );

    await Promise.all(this.agents.map(agent => agent.start()));
  }

  private async stopAgents() {
    await Promise.all(this.agents.map(agent => agent.stop()));
  }
}

export function buildServerCircuitProver(
  config: Omit<ActualProverConfig, 'enqueueConcurrency'> & ACVMConfig & BBConfig,
  telemetry: TelemetryClient,
): Promise<ServerCircuitProver> {
  if (config.realProofs) {
    return BBNativeRollupProver.new(config, telemetry);
  }

  const logger = createLogger('prover-client:acvm-native');
  const simulator = config.acvmBinaryPath
    ? new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath, undefined, logger)
    : undefined;

  return Promise.resolve(new TestCircuitProver(simulator, config, telemetry));
}
