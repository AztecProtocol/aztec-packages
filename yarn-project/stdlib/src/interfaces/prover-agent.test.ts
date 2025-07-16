import { randomBytes } from '@aztec/foundation/crypto';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { type ProverAgentApi, ProverAgentApiSchema, type ProverAgentStatus } from './prover-agent.js';
import { makeProvingJobId } from './proving-job.js';

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

  it.each<ProverAgentStatus>([
    {
      status: 'stopped',
    },
    {
      status: 'running',
    },
    {
      status: 'proving',
      jobId: makeProvingJobId(42, ProvingRequestType.PUBLIC_BASE_ROLLUP, randomBytes(64).toString('hex')),
      proofType: ProvingRequestType.PUBLIC_BASE_ROLLUP,
      startedAtISO: new Date().toISOString(),
    },
  ])('getStatus', async expectedStatus => {
    handler.setStatus(expectedStatus);
    const status = await context.client.getStatus();
    expect(status).toEqual(expectedStatus);
  });
});

class MockProverAgent implements ProverAgentApi {
  private status: ProverAgentStatus = { status: 'stopped' };
  setStatus(status: ProverAgentStatus) {
    this.status = status;
  }
  getStatus() {
    return Promise.resolve(this.status);
  }
}
