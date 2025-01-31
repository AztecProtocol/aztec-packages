import { ProvingRequestType, makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import {
  makeBaseParityInputs,
  makeParityPublicInputs,
  makePrivateBaseRollupInputs,
  makePublicBaseRollupInputs,
  makeRootRollupInputs,
} from '@aztec/circuits.js/testing';
import { AbortError } from '@aztec/foundation/error';
import { sleep } from '@aztec/foundation/sleep';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { InlineProofStore, type ProofStore } from '../proving_broker/proof_store/index.js';
import { MemoryProvingQueue } from './memory-proving-queue.js';

describe('MemoryProvingQueue', () => {
  let queue: MemoryProvingQueue;
  let jobTimeoutMs: number;
  let pollingIntervalMs: number;
  let proofStore: ProofStore;

  beforeEach(() => {
    jobTimeoutMs = 100;
    pollingIntervalMs = 10;
    proofStore = new InlineProofStore();
    queue = new MemoryProvingQueue(
      getTelemetryClient(),
      jobTimeoutMs,
      pollingIntervalMs,
      undefined,
      undefined,
      proofStore,
    );
    queue.start();
  });

  afterEach(async () => {
    await queue.stop();
  });

  it('returns jobs in order', async () => {
    void queue.getBaseParityProof(makeBaseParityInputs());
    void queue.getPrivateBaseRollupProof(makePrivateBaseRollupInputs());

    const job1 = await queue.getProvingJob();
    expect(job1?.type).toEqual(ProvingRequestType.BASE_PARITY);

    const job2 = await queue.getProvingJob();
    expect(job2?.type).toEqual(ProvingRequestType.PRIVATE_BASE_ROLLUP);
  });

  it('returns jobs ordered by priority', async () => {
    // We push base rollup proof requests for a first block
    void queue.getPrivateBaseRollupProof(makePrivateBaseRollupInputs(), undefined, 1);
    void queue.getPublicBaseRollupProof(makePublicBaseRollupInputs(), undefined, 1);

    // The agent consumes one of them
    expect((await queue.getProvingJob())!.type).toEqual(ProvingRequestType.PRIVATE_BASE_ROLLUP);

    // A new block comes along with its base rollups, and the orchestrator then pushes a root request for the first one
    void queue.getPublicBaseRollupProof(makePublicBaseRollupInputs(), undefined, 2);
    void queue.getPrivateBaseRollupProof(makePrivateBaseRollupInputs(), undefined, 2);
    void queue.getPrivateBaseRollupProof(makePrivateBaseRollupInputs(), undefined, 2);
    void queue.getPublicBaseRollupProof(makePublicBaseRollupInputs(), undefined, 2);
    void queue.getRootRollupProof(makeRootRollupInputs(), undefined, 1);

    // The next jobs for the agent should be the ones from block 1, skipping the ones for block 2
    expect((await queue.getProvingJob())!.type).toEqual(ProvingRequestType.PUBLIC_BASE_ROLLUP);
    expect((await queue.getProvingJob())!.type).toEqual(ProvingRequestType.ROOT_ROLLUP);

    // And the base rollups for block 2 should go next
    expect((await queue.getProvingJob())!.type).toEqual(ProvingRequestType.PUBLIC_BASE_ROLLUP);
    expect((await queue.getProvingJob())!.type).toEqual(ProvingRequestType.PRIVATE_BASE_ROLLUP);
    expect((await queue.getProvingJob())!.type).toEqual(ProvingRequestType.PRIVATE_BASE_ROLLUP);
    expect((await queue.getProvingJob())!.type).toEqual(ProvingRequestType.PUBLIC_BASE_ROLLUP);
  });

  it('returns undefined when no jobs are available', async () => {
    await expect(queue.getProvingJob({ timeoutSec: 0 })).resolves.toBeUndefined();
  });

  it('notifies of completion', async () => {
    const inputs = makeBaseParityInputs();
    const promise = queue.getBaseParityProof(inputs);

    const job = await queue.getProvingJob();
    const jobInputs = await proofStore.getProofInput(job!.inputsUri);
    expect(jobInputs.inputs).toEqual(inputs);

    const publicInputs = makeParityPublicInputs();
    const proof = makeRecursiveProof<typeof RECURSIVE_PROOF_LENGTH>(RECURSIVE_PROOF_LENGTH);
    const vk = VerificationKeyData.makeFakeHonk();
    const result = makePublicInputsAndRecursiveProof(publicInputs, proof, vk);
    await queue.resolveProvingJob(job!.id, {
      type: ProvingRequestType.BASE_PARITY,
      result,
    });
    await expect(promise).resolves.toEqual(result);
  });

  it('retries failed jobs', async () => {
    const inputs = makeBaseParityInputs();
    void queue.getBaseParityProof(inputs);

    const job = await queue.getProvingJob();
    const proofInput = await proofStore.getProofInput(job!.inputsUri);
    expect(proofInput.inputs).toEqual(inputs);

    const error = new Error('test error');

    await queue.rejectProvingJob(job!.id, error.message);
    await expect(queue.getProvingJob()).resolves.toEqual(job);
  });

  it('notifies errors', async () => {
    const promise = queue.getBaseParityProof(makeBaseParityInputs());

    const error = new Error('test error');
    await queue.rejectProvingJob((await queue.getProvingJob())!.id, error.message);
    await queue.rejectProvingJob((await queue.getProvingJob())!.id, error.message);
    await queue.rejectProvingJob((await queue.getProvingJob())!.id, error.message);

    await expect(promise).rejects.toEqual(error);
  });

  it('reaps timed out jobs', async () => {
    const controller = new AbortController();
    const promise = queue.getBaseParityProof(makeBaseParityInputs(), controller.signal);
    const job = await queue.getProvingJob();

    expect(queue.isJobRunning(job!.id)).toBe(true);
    await sleep(jobTimeoutMs + 2 * pollingIntervalMs);
    expect(queue.isJobRunning(job!.id)).toBe(false);

    controller.abort();
    await expect(promise).rejects.toThrow(AbortError);
  });

  it('keeps jobs running while heartbeat is called', async () => {
    const promise = queue.getBaseParityProof(makeBaseParityInputs());
    const job = await queue.getProvingJob();

    expect(queue.isJobRunning(job!.id)).toBe(true);
    await sleep(pollingIntervalMs);
    expect(queue.isJobRunning(job!.id)).toBe(true);

    await queue.heartbeat(job!.id);
    expect(queue.isJobRunning(job!.id)).toBe(true);
    await sleep(pollingIntervalMs);
    expect(queue.isJobRunning(job!.id)).toBe(true);

    const output = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
    await queue.resolveProvingJob(job!.id, { type: ProvingRequestType.BASE_PARITY, result: output });
    await expect(promise).resolves.toEqual(output);
  });
});
