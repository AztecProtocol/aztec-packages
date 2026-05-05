import { type ACVMConfig, type BBConfig, BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import { times } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
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
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import {
  BlockExecutionHandler,
  CompositeServerCircuitProver,
  type ProverClientBlockExecutionDeps,
} from '../block_execution/index.js';
import type { ProverClientConfig } from '../config.js';
import { CheckpointSubTreeOrchestrator } from '../orchestrator/checkpoint-sub-tree-orchestrator.js';
import { EpochProvingContext } from '../orchestrator/epoch-proving-context.js';
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
 * race and lose notifications until a 30s snapshot-sync catches up — which exceeds
 * the proof deadline for short epochs.
 *
 * The facade's job map cleans up entries on resolve/reject, and the prover-node
 * keeps `ProverClient` alive for its whole lifetime, so the long-lived singleton is
 * safe and is the simplest design.
 */
export interface EpochProverFactory {
  getProverId(): EthAddress;
  /**
   * Constructs a per-epoch shared chonk-verifier cache wired to the prover-client's
   * broker facade. The caller (`EpochProvingJob`) constructs one per epoch and passes
   * it to every sub-tree it creates so the chonk proof for a tx that gets reorged out
   * and re-appears in a replacement checkpoint can be reused.
   */
  createEpochProvingContext(): EpochProvingContext;
  /**
   * @param epochContext - Optional shared chonk-verifier cache. When supplied, every
   *   sub-tree created with the same context shares its proof cache, so a tx whose
   *   checkpoint is reorged out and re-appears in a replacement checkpoint reuses the
   *   cached proof. The caller (`EpochProvingJob`) constructs one context per epoch.
   */
  createCheckpointSubTreeOrchestrator(epochContext?: EpochProvingContext): CheckpointSubTreeOrchestrator;
  createTopTreeOrchestrator(): TopTreeOrchestrator;
  /**
   * Returns the broker facade. Used by `EpochProvingJob` to dispatch
   * `BLOCK_EXECUTION` jobs and watch deterministic-ID per-tx jobs through the
   * same facade the orchestrators use.
   */
  getBrokerCircuitProverFacade(): BrokerCircuitProverFacade;
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

  private constructor(
    private config: ProverClientConfig,
    private worldState: ForkMerkleTreeOperations & ReadonlyWorldStateAccess,
    private orchestratorClient: ProvingJobProducer & ProvingJobConsumer,
    private proofStore: ProofStore,
    private failedProofStore: ProofStore | undefined,
    private agentClient?: ProvingJobConsumer,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log: Logger = createLogger('prover-client:tx-prover'),
    private blockExecutionDeps?: ProverClientBlockExecutionDeps,
  ) {}

  private getFacade(): BrokerCircuitProverFacade {
    if (!this.facade) {
      throw new Error('ProverClient is not running; call start() before constructing orchestrators.');
    }
    return this.facade;
  }

  /**
   * Returns the single shared broker facade. Public so the prover node can dispatch
   * BLOCK_EXECUTION and watch deterministic-ID per-tx jobs through the same facade
   * that the orchestrators use.
   */
  public getBrokerCircuitProverFacade(): BrokerCircuitProverFacade {
    return this.getFacade();
  }

  public createEpochProvingContext(): EpochProvingContext {
    return new EpochProvingContext(this.getFacade(), this.log.getBindings());
  }

  public createCheckpointSubTreeOrchestrator(epochContext?: EpochProvingContext): CheckpointSubTreeOrchestrator {
    return new CheckpointSubTreeOrchestrator(
      this.worldState,
      this.getFacade(),
      this.config.proverId,
      this.config.cancelJobsOnStop,
      this.config.enqueueConcurrency,
      this.telemetry,
      this.log.getBindings(),
      epochContext,
    );
  }

  public createTopTreeOrchestrator(): TopTreeOrchestrator {
    return new TopTreeOrchestrator(
      this.getFacade(),
      this.config.proverId,
      this.config.enqueueConcurrency,
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
    this.facade = new BrokerCircuitProverFacade(
      this.orchestratorClient,
      this.proofStore,
      this.failedProofStore,
      undefined,
      this.log.getBindings(),
    );
    this.facade.start();
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
    if (this.facade) {
      try {
        await this.facade.stop();
      } catch (err) {
        this.log.error('Error stopping shared broker facade', err);
      }
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
    blockExecutionDeps?: ProverClientBlockExecutionDeps,
  ) {
    const proofStore = await createProofStore(config.proofStore);
    const failedProofStore = config.failedProofStore ? await createProofStore(config.failedProofStore) : undefined;
    const prover = new ProverClient(
      config,
      worldState,
      broker,
      proofStore,
      failedProofStore,
      broker,
      telemetry,
      undefined,
      blockExecutionDeps,
    );
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
    const baseProver = await buildServerCircuitProver(this.config, this.telemetry);
    const bindings = this.log.getBindings();

    // When the caller has supplied block-execution dependencies, every agent runs a
    // composite prover: regular proving methods go to the base prover, BLOCK_EXECUTION
    // jobs go to a `BlockExecutionHandler` wired to the supplied world state, public
    // processor factory and tx fetcher. With no deps, the agents are proving-only and
    // `executeBlock` rejects.
    const circuitProver: ServerCircuitProver = this.blockExecutionDeps
      ? new CompositeServerCircuitProver(
          baseProver,
          new BlockExecutionHandler(
            this.worldState,
            this.blockExecutionDeps.publicProcessorFactory,
            this.blockExecutionDeps.txFetcher,
            proofStore,
            this.orchestratorClient,
            this.config.proverId.toField(),
            bindings,
          ),
        )
      : baseProver;

    this.agents = times(
      this.config.proverAgentCount,
      () =>
        new ProvingAgent(
          this.agentClient!,
          proofStore,
          circuitProver,
          [],
          this.config.proverAgentPollIntervalMs,
          bindings,
        ),
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
