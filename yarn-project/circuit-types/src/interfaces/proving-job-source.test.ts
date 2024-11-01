import {
  BaseOrMergeRollupPublicInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  PrivateBaseRollupInputs,
  VerificationKeyData,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type ProvingJobSource, ProvingJobSourceSchema } from './proving-job-source.js';
import {
  type ProvingJob,
  type ProvingRequest,
  type ProvingRequestResult,
  type ProvingRequestResultFor,
  ProvingRequestType,
  makePublicInputsAndRecursiveProof,
} from './proving-job.js';

describe('ProvingJobSourceSchema', () => {
  let handler: MockProvingJobSource;
  let context: JsonRpcTestContext<ProvingJobSource>;

  beforeEach(async () => {
    handler = new MockProvingJobSource();
    context = await createJsonRpcTestSetup<ProvingJobSource>(handler, ProvingJobSourceSchema);
  });

  afterEach(() => {
    context.httpServer.close();
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
  getProvingJob(): Promise<ProvingJob<ProvingRequest> | undefined> {
    return Promise.resolve({
      id: 'a-job-id',
      request: { type: ProvingRequestType.PRIVATE_BASE_ROLLUP, inputs: PrivateBaseRollupInputs.empty() },
    });
  }
  heartbeat(jobId: string): Promise<void> {
    expect(typeof jobId).toEqual('string');
    return Promise.resolve();
  }
  resolveProvingJob(jobId: string, result: ProvingRequestResult): Promise<void> {
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
