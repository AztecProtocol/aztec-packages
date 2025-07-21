import { type ACVMConfig, type BBConfig, BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { NativeACVMSimulator } from '@aztec/simulator/server';
import {
  type ActualProverConfig,
  type EpochProver,
  type EpochProverManager,
  type ForkMerkleTreeOperations,
  type ProvingJobBroker,
  type ProvingJobConsumer,
  type ProvingJobProducer,
  type ServerCircuitProver,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { ProverClientConfig } from '../config.js';
import { ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { InlineProofStore, type ProofStore, createProofStore } from '../proving_broker/proof_store/index.js';
import { ProvingAgent } from '../proving_broker/proving_agent.js';
import { ServerEpochProver } from './server-epoch-prover.js';

/** Manages proving of epochs by orchestrating the proving of individual blocks relying on a pool of prover agents. */
export class ProverClient implements EpochProverManager {
  private running = false;
  private agents: ProvingAgent[] = [];

  private proofStore: ProofStore;
  private failedProofStore: ProofStore | undefined;

  private constructor(
    private config: ProverClientConfig,
    private worldState: ForkMerkleTreeOperations,
    private orchestratorClient: ProvingJobProducer,
    private agentClient?: ProvingJobConsumer,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('prover-client:tx-prover'),
  ) {
    this.proofStore = new InlineProofStore();
    this.failedProofStore = this.config.failedProofStore ? createProofStore(this.config.failedProofStore) : undefined;
  }

  public createEpochProver(): EpochProver {
    const facade = new BrokerCircuitProverFacade(this.orchestratorClient, this.proofStore, this.failedProofStore);
    const orchestrator = new ProvingOrchestrator(this.worldState, facade, this.config.proverId, this.telemetry);
    return new ServerEpochProver(facade, orchestrator);
  }

  public getProverId(): Fr {
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
    worldState: ForkMerkleTreeOperations,
    broker: ProvingJobBroker,
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    const prover = new ProverClient(config, worldState, broker, broker, telemetry);
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
    this.agents = times(
      this.config.proverAgentCount,
      () =>
        new ProvingAgent(
          this.agentClient!,
          proofStore,
          prover,
          [],
          this.config.proverAgentPollIntervalMs,
          this.telemetry,
        ),
    );

    await Promise.all(this.agents.map(agent => agent.start()));
  }

  private async stopAgents() {
    await Promise.all(this.agents.map(agent => agent.stop()));
  }
}

export function buildServerCircuitProver(
  config: ActualProverConfig & ACVMConfig & BBConfig,
  telemetry: TelemetryClient,
): Promise<ServerCircuitProver> {
  if (config.realProofs) {
    return BBNativeRollupProver.new(config, telemetry);
  }

  const simulator = config.acvmBinaryPath
    ? new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath)
    : undefined;

  return Promise.resolve(new TestCircuitProver(simulator, config, telemetry));
}
