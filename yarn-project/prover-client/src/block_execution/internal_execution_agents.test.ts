import { Fr } from '@aztec/foundation/curves/bn254';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import type { ForkMerkleTreeOperations, ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { jest } from '@jest/globals';

import type { TxFetcher } from './block_execution_handler.js';
import { InternalExecutionAgents } from './internal_execution_agents.js';

describe('InternalExecutionAgents', () => {
  let broker: jest.Mocked<ProvingJobBroker>;
  let worldState: jest.Mocked<Pick<ForkMerkleTreeOperations, 'fork'>>;
  let publicProcessorFactory: PublicProcessorFactory;
  const txFetcher: TxFetcher = () => Promise.resolve([]);
  const proverId = new Fr(1);

  beforeEach(() => {
    broker = mockBroker();
    worldState = { fork: jest.fn() };
    publicProcessorFactory = {} as unknown as PublicProcessorFactory;
  });

  it('does not start any agents when count is 0', async () => {
    const agents = new InternalExecutionAgents(
      { count: 0, pollIntervalMs: 100 },
      broker,
      worldState,
      publicProcessorFactory,
      txFetcher,
      proverId,
    );
    await agents.start();
    expect(agents.getAgentCount()).toEqual(0);
    expect(broker.getProvingJob).not.toHaveBeenCalled();
    await agents.stop();
  });

  it('starts the requested number of agents and stops cleanly', async () => {
    const agents = new InternalExecutionAgents(
      { count: 3, pollIntervalMs: 60_000 },
      broker,
      worldState,
      publicProcessorFactory,
      txFetcher,
      proverId,
    );
    await agents.start();
    expect(agents.getAgentCount()).toEqual(3);

    await agents.stop();
    expect(agents.getAgentCount()).toEqual(0);
  });

  it('refuses to start twice', async () => {
    const agents = new InternalExecutionAgents(
      { count: 1, pollIntervalMs: 60_000 },
      broker,
      worldState,
      publicProcessorFactory,
      txFetcher,
      proverId,
    );
    await agents.start();
    await expect(agents.start()).rejects.toThrow(/already started/);
    await agents.stop();
  });

  it('asks the broker only for BLOCK_EXECUTION jobs', async () => {
    const agents = new InternalExecutionAgents(
      { count: 1, pollIntervalMs: 60_000 },
      broker,
      worldState,
      publicProcessorFactory,
      txFetcher,
      proverId,
    );
    await agents.start();

    // Wait a beat so the agent can fire its first poll.
    await new Promise(resolve => setTimeout(resolve, 25));

    expect(broker.getProvingJob).toHaveBeenCalled();
    for (const call of broker.getProvingJob.mock.calls) {
      expect(call[0]?.allowList).toEqual([ProvingRequestType.BLOCK_EXECUTION]);
    }

    await agents.stop();
  });
});

function mockBroker(): jest.Mocked<ProvingJobBroker> {
  return {
    getProvingJob: jest.fn(() => Promise.resolve(undefined)),
    getCompletedJobs: jest.fn(() => Promise.resolve([])),
    enqueueProvingJob: jest.fn(() => Promise.resolve({ status: 'in-queue' })),
    cancelProvingJob: jest.fn(() => Promise.resolve()),
    getProvingJobStatus: jest.fn(() => Promise.resolve({ status: 'in-queue' })),
    reportProvingJobError: jest.fn(() => Promise.resolve(undefined)),
    reportProvingJobProgress: jest.fn(() => Promise.resolve(undefined)),
    reportProvingJobSuccess: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as jest.Mocked<ProvingJobBroker>;
}
