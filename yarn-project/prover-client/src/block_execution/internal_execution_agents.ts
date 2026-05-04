import { times } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import type { ForkMerkleTreeOperations, ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { InlineProofStore } from '../proving_broker/proof_store/index.js';
import { ProvingAgent } from '../proving_broker/proving_agent.js';
import { BlockExecutionHandler, type TxFetcher } from './block_execution_handler.js';

export type InternalExecutionAgentsConfig = {
  /** Number of internal execution agents to spawn. `0` disables the feature. */
  count: number;
  /**
   * Poll interval for the execution agents. Execution gates the rest of the proving
   * DAG, so a tighter interval than the regular proving agents is appropriate.
   */
  pollIntervalMs: number;
};

/**
 * Owns a set of `ProvingAgent`s configured to handle only `BLOCK_EXECUTION` jobs,
 * each backed by a `BlockExecutionHandler` wired to the supplied world state, public
 * processor factory and tx fetcher. Used by the prover node to run execution agents
 * in-process — the intermediate deployment shape before standalone remote agents.
 */
export class InternalExecutionAgents {
  private agents: ProvingAgent[] = [];
  private readonly log: Logger;

  constructor(
    private readonly config: InternalExecutionAgentsConfig,
    private readonly broker: ProvingJobBroker,
    private readonly worldState: Pick<ForkMerkleTreeOperations, 'fork'>,
    private readonly publicProcessorFactory: PublicProcessorFactory,
    private readonly txFetcher: TxFetcher,
    private readonly proverId: Fr,
    private readonly bindings?: LoggerBindings,
  ) {
    this.log = createLogger('prover-client:internal-execution-agents', bindings);
  }

  public async start(): Promise<void> {
    if (this.agents.length > 0) {
      throw new Error('InternalExecutionAgents already started');
    }
    if (this.config.count <= 0) {
      this.log.verbose('Internal execution agents disabled (count = 0)');
      return;
    }

    // The store is stateless (data uri), so each agent could have its own; sharing one
    // makes lifecycle reasoning simpler.
    const proofStore = new InlineProofStore();

    this.agents = times(this.config.count, i => {
      const handler = new BlockExecutionHandler(
        this.worldState,
        this.publicProcessorFactory,
        this.txFetcher,
        proofStore,
        this.broker,
        this.proverId,
        { ...this.bindings, instanceId: `exec-agent-${i}` },
      );
      return new ProvingAgent(
        this.broker,
        proofStore,
        handler,
        [ProvingRequestType.BLOCK_EXECUTION],
        this.config.pollIntervalMs,
        { ...this.bindings, instanceId: `exec-agent-${i}` },
      );
    });

    await Promise.all(this.agents.map(agent => agent.start()));
    this.log.info(
      `Started ${this.agents.length} internal execution agent(s) at ${this.config.pollIntervalMs}ms poll interval`,
    );
  }

  public async stop(): Promise<void> {
    if (this.agents.length === 0) {
      return;
    }
    await Promise.all(this.agents.map(agent => agent.stop()));
    this.agents = [];
  }

  public getAgentCount(): number {
    return this.agents.length;
  }
}
