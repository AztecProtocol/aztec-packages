import {
  BaseOrMergeRollupPublicInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  VerificationKeyData,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type ProvingJobSource, ProvingJobSourceSchema } from './proving-job-source.js';
import {
  type ProofUri,
  type ProvingJob,
  type ProvingJobResult,
  type ProvingRequestResultFor,
  ProvingRequestType,
  makePublicInputsAndRecursiveProof,
} from './proving-job.js';

describe('ProvingJobSourceSchema', () => {
  let handler: MockProvingJobSource;
  let context: JsonRpcTestContext<ProvingJobSource>;

  const tested = new Set<string>();

  beforeEach(async () => {
    handler = new MockProvingJobSource();
    context = await createJsonRpcTestSetup<ProvingJobSource>(handler, ProvingJobSourceSchema);
  });

  afterEach(() => {
    tested.add(/^ProvingJobSourceSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(ProvingJobSourceSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getProvingJob', async () => {
    const job = await context.client.getProvingJob();
    const expected = await handler.getProvingJob();
    expect(expected).toEqual(expected);
    expect(job).toEqual(expected);
  });

  it('heartbeat', async () => {
    await context.client.heartbeat('a-job-id');
  });

  it('resolveProvingJob', async () => {
    await context.client.resolveProvingJob('a-job-id', {
      type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
      result: makePublicInputsAndRecursiveProof(
        BaseOrMergeRollupPublicInputs.empty(),
        makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    });
  });

  it('rejectProvingJob', async () => {
    await context.client.rejectProvingJob('a-job-id', 'reason');
  });
});

class MockProvingJobSource implements ProvingJobSource {
  getProvingJob(): Promise<ProvingJob | undefined> {
    return Promise.resolve({
      id: 'a-job-id',
      type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
      inputsUri: 'inputs-uri' as ProofUri,
    });
  }
  heartbeat(jobId: string): Promise<void> {
    expect(typeof jobId).toEqual('string');
    return Promise.resolve();
  }
  resolveProvingJob(jobId: string, result: ProvingJobResult): Promise<void> {
    expect(typeof jobId).toEqual('string');
    const baseRollupResult = result as ProvingRequestResultFor<typeof ProvingRequestType.PRIVATE_BASE_ROLLUP>;
    expect(baseRollupResult.result.inputs).toBeInstanceOf(BaseOrMergeRollupPublicInputs);
    return Promise.resolve();
  }
  rejectProvingJob(jobId: string, reason: string): Promise<void> {
    expect(typeof reason).toEqual('string');
    expect(typeof jobId).toEqual('string');
    return Promise.resolve();
  }
}
