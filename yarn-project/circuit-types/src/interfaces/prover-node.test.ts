import { createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import type { JsonRpcTestContext } from '@aztec/foundation/json-rpc/test';

import { ProverNodeApiSchema } from './prover-node.js';
import type { EpochProvingJobState, ProverNodeApi } from './prover-node.js';

describe('ProvingNodeApiSchema', () => {
  let handler: MockProverNode;
  let context: JsonRpcTestContext<ProverNodeApi>;

  const tested = new Set<string>();

  beforeEach(async () => {
    handler = new MockProverNode();
    context = await createJsonRpcTestSetup<ProverNodeApi>(handler, ProverNodeApiSchema);
  });

  afterEach(() => {
    tested.add(/^ProvingNodeApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(ProverNodeApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getJobs', async () => {
    const jobs = await context.client.getJobs();
    const expected = await handler.getJobs();
    expect(jobs).toEqual(expected);
  });

  it('startProof', async () => {
    await context.client.startProof(1);
  });

  it('prove', async () => {
    await context.client.prove(1);
  });
});

class MockProverNode implements ProverNodeApi {
  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: number }[]> {
    return Promise.resolve([
      { uuid: 'uuid1', status: 'initialized', epochNumber: 10 },
      { uuid: 'uuid2', status: 'processing', epochNumber: 10 },
      { uuid: 'uuid3', status: 'awaiting-prover', epochNumber: 10 },
      { uuid: 'uuid4', status: 'publishing-proof', epochNumber: 10 },
      { uuid: 'uuid5', status: 'completed', epochNumber: 10 },
      { uuid: 'uuid6', status: 'failed', epochNumber: 10 },
    ]);
  }
  startProof(epochNumber: number): Promise<void> {
    expect(typeof epochNumber).toBe('number');
    return Promise.resolve();
  }
  prove(epochNumber: number): Promise<void> {
    expect(typeof epochNumber).toBe('number');
    return Promise.resolve();
  }
}
