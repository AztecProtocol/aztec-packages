import { MemoryProvingQueue } from './memory-proving-queue.js';
import { type ProvingAgent } from './prover-agent.js';
import { type ProvingQueue } from './proving-queue.js';

/**
 * Utility class that spawns N prover agents all connected to the same queue
 */
export class ProverPool {
  private agents: ProvingAgent[] = [];

  constructor(
    private size: number,
    private agentFactory: (i: number) => ProvingAgent | Promise<ProvingAgent>,
    public readonly queue: ProvingQueue = new MemoryProvingQueue(),
  ) {}

  async start(): Promise<void> {
    this.agents = [];
    for (let i = 0; i < this.size; i++) {
      this.agents.push(await this.agentFactory(i));
    }

    for (const agent of this.agents) {
      agent.start(this.queue);
    }
  }

  async stop(): Promise<void> {
    for (const agent of this.agents) {
      await agent.stop();
    }
  }
}
