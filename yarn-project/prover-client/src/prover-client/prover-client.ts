import { type ACVMConfig, type BBConfig, BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import {
  type ActualProverConfig,
  type EpochProver,
  type EpochProverManager,
  type ForkMerkleTreeOperations,
  type ProvingJobBroker,
  type ProvingJobConsumer,
  type ProvingJobProducer,
  type ServerCircuitProver,
} from '@aztec/circuit-types/interfaces';
import { Fr } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { NativeACVMSimulator } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { type ProverClientConfig } from '../config.js';
import { ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { InlineProofStore } from '../proving_broker/proof_store.js';
import { ProvingAgent } from '../proving_broker/proving_agent.js';
import { ServerEpochProver } from './server-epoch-prover.js';

/** Manages proving of epochs by orchestrating the proving of individual blocks relying on a pool of prover agents. */
export class ProverClient implements EpochProverManager {
  private running = false;
  private agents: ProvingAgent[] = [];

  private constructor(
    private config: ProverClientConfig,
    private worldState: ForkMerkleTreeOperations,
    private telemetry: TelemetryClient,
    private orchestratorClient: ProvingJobProducer,
    private agentClient?: ProvingJobConsumer,
    private log = createLogger('prover-client:tx-prover'),
  ) {
    // TODO(palla/prover-node): Cache the paddingTx here, and not in each proving orchestrator,
    // so it can be reused across multiple ones and not recomputed every time.
  }

  public createEpochProver(): EpochProver {
    const facade = new BrokerCircuitProverFacade(this.orchestratorClient);
    const orchestrator = new ProvingOrchestrator(this.worldState, facade, this.telemetry, this.config.proverId);
    return new ServerEpochProver(facade, orchestrator);
  }

  public getProverId(): Fr {
    return this.config.proverId ?? Fr.ZERO;
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

    if (!this.config.realProofs && newConfig.realProofs) {
      // TODO(palla/prover-node): Reset padding tx here once we cache it at this class
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
    telemetry: TelemetryClient,
  ) {
    const prover = new ProverClient(config, worldState, telemetry, broker, broker);
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
          this.telemetry,
          [],
          this.config.proverAgentPollIntervalMs,
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

  const simulationProvider = config.acvmBinaryPath
    ? new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath)
    : undefined;

  return Promise.resolve(new TestCircuitProver(telemetry, simulationProvider, config));
}
