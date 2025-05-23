import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type ProverAgentApi, ProverAgentApiSchema } from './prover-agent.js';

describe('ProverAgentApiSchema', () => {
  let handler: MockProverAgent;
  let context: JsonRpcTestContext<ProverAgentApi>;

  const tested = new Set<string>();

  beforeEach(async () => {
    handler = new MockProverAgent();
    context = await createJsonRpcTestSetup<ProverAgentApi>(handler, ProverAgentApiSchema);
  });

  afterEach(() => {
    tested.add(/^ProverAgentApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(ProverAgentApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('setMaxConcurrency', async () => {
    await context.client.setMaxConcurrency(1);
  });

  it('isRunning', async () => {
    const running = await context.client.isRunning();
    expect(running).toBe(true);
  });

  it('getCurrentJobs', async () => {
    const jobs = await context.client.getCurrentJobs();
    expect(jobs).toEqual([
      { id: '1', type: 'type1' },
      { id: '2', type: 'type2' },
    ]);
  });
});

class MockProverAgent implements ProverAgentApi {
  setMaxConcurrency(_maxConcurrency: number): Promise<void> {
    return Promise.resolve();
  }
  isRunning(): Promise<boolean> {
    return Promise.resolve(true);
  }
  getCurrentJobs(): Promise<{ id: string; type: string }[]> {
    return Promise.resolve([
      { id: '1', type: 'type1' },
      { id: '2', type: 'type2' },
    ]);
  }
}
