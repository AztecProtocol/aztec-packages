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

import type { ProverClientConfig } from '../config.js';
import { CheckpointSubTreeOrchestrator } from '../orchestrator/checkpoint-sub-tree-orchestrator.js';
import { TopTreeOrchestrator } from '../orchestrator/top-tree-orchestrator.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { InlineProofStore, type ProofStore, createProofStore } from '../proving_broker/proof_store/index.js';
import { ProvingAgent } from '../proving_broker/proving_agent.js';

/**
 * The factory surface that `EpochProvingJob` (in `prover-node`) depends on. Implemented
 * by `ProverClient`. Defined here rather than in stdlib because the return types
 * (`CheckpointSubTreeOrchestrator`, `TopTreeOrchestrator`, `BrokerCircuitProverFacade`)
 * are concrete classes from this package.
 */
export interface EpochProverFactory {
  getProverId(): EthAddress;
  createCheckpointSubTreeOrchestrator(): {
    orchestrator: CheckpointSubTreeOrchestrator;
    facade: BrokerCircuitProverFacade;
  };
  createTopTreeOrchestrator(): {
    orchestrator: TopTreeOrchestrator;
    facade: BrokerCircuitProverFacade;
  };
}

/** Manages proving of epochs by orchestrating the proving of individual blocks relying on a pool of prover agents. */
export class ProverClient implements EpochProverManager, EpochProverFactory {
  private running = false;
  private agents: ProvingAgent[] = [];

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
   * Creates a fresh `CheckpointSubTreeOrchestrator` plus the broker facade it needs. The
   * facade's lifecycle follows the orchestrator's — start it before driving and stop it
   * when the orchestrator stops. Used by `EpochProvingJob` to spin up a sub-tree per
   * checkpoint.
   */
  public createCheckpointSubTreeOrchestrator(): {
    orchestrator: CheckpointSubTreeOrchestrator;
    facade: BrokerCircuitProverFacade;
  } {
    const bindings = this.log.getBindings();
    const facade = new BrokerCircuitProverFacade(
      this.orchestratorClient,
      this.proofStore,
      this.failedProofStore,
      undefined,
      bindings,
    );
    const orchestrator = new CheckpointSubTreeOrchestrator(
      this.worldState,
      facade,
      this.config.proverId,
      this.config.cancelJobsOnStop,
      this.config.enqueueConcurrency,
      this.telemetry,
      bindings,
    );
    return { orchestrator, facade };
  }

  /**
   * Creates a fresh `TopTreeOrchestrator` plus the broker facade it needs. The top tree
   * has no world-state dependency; it consumes block-level proofs supplied by sub-trees
   * and per-checkpoint archiver data assembled by the caller.
   */
  public createTopTreeOrchestrator(): {
    orchestrator: TopTreeOrchestrator;
    facade: BrokerCircuitProverFacade;
  } {
    const bindings = this.log.getBindings();
    const facade = new BrokerCircuitProverFacade(
      this.orchestratorClient,
      this.proofStore,
      this.failedProofStore,
      undefined,
      bindings,
    );
    const orchestrator = new TopTreeOrchestrator(
      facade,
      this.config.proverId,
      this.config.enqueueConcurrency,
      this.telemetry,
      bindings,
    );
    return { orchestrator, facade };
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
