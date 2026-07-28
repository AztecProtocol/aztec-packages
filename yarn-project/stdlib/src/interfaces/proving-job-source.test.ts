import { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { makeRecursiveProof } from '../proofs/recursive_proof.js';
import { BlockRollupPublicInputs } from '../rollup/block_rollup_public_inputs.js';
import { TxRollupPublicInputs } from '../rollup/tx_rollup_public_inputs.js';
import { makeBlockRollupPublicInputs } from '../tests/factories.js';
import { VerificationKeyData } from '../vks/verification_key.js';
import { type ProvingJobSource, ProvingJobSourceSchema } from './proving-job-source.js';
import {
  type ProofUri,
  type ProvingJob,
  ProvingJobResult,
  type ProvingRequestResultFor,
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
      type: ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
      result: makePublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>(
        TxRollupPublicInputs.empty(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    });
  });

  it('rejectProvingJob', async () => {
    await context.client.rejectProvingJob('a-job-id', 'reason');
  });
});

describe('ProvingJobResult', () => {
  it('round-trips a message-only block-root rollup result through the schema', () => {
    // The message-only block-root proof type must survive serialization: a checkpoint that builds a message-only
    // block produces this result, and the proof store decodes it via the ProvingJobResult schema. Omitting it from
    // the union throws "Invalid discriminator value" and stalls proving.
    const result: ProvingJobResult = {
      type: ProvingRequestType.BLOCK_ROOT_MSGS_ONLY_ROLLUP,
      result: makePublicInputsAndRecursiveProof<
        BlockRollupPublicInputs,
        typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
      >(
        makeBlockRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    };

    const roundTripped = jsonParseWithSchema<ProvingJobResult>(jsonStringify(result), ProvingJobResult);
    expect(roundTripped.type).toEqual(ProvingRequestType.BLOCK_ROOT_MSGS_ONLY_ROLLUP);
  });
});

class MockProvingJobSource implements ProvingJobSource {
  getProvingJob(): Promise<ProvingJob | undefined> {
    return Promise.resolve({
      id: 'a-job-id',
      type: ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
      inputsUri: 'inputs-uri' as ProofUri,
      epochNumber: EpochNumber(1),
    });
  }
  heartbeat(jobId: string): Promise<void> {
    expect(typeof jobId).toEqual('string');
    return Promise.resolve();
  }
  resolveProvingJob(jobId: string, result: ProvingJobResult): Promise<void> {
    expect(typeof jobId).toEqual('string');
    const baseRollupResult = result as ProvingRequestResultFor<typeof ProvingRequestType.PRIVATE_TX_BASE_ROLLUP>;
    expect(baseRollupResult.result.inputs).toBeInstanceOf(TxRollupPublicInputs);
    return Promise.resolve();
  }
  rejectProvingJob(jobId: string, reason: string): Promise<void> {
    expect(typeof reason).toEqual('string');
    expect(typeof jobId).toEqual('string');
    return Promise.resolve();
  }
}
