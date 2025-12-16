import { RECURSIVE_PROOF_LENGTH } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { AbortError } from '@aztec/foundation/error';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { ProvingError } from '@aztec/stdlib/errors';
import {
  type ProofUri,
  type ProvingJob,
  type ProvingJobConsumer,
  type ProvingJobId,
  type ProvingJobInputs,
  type PublicInputsAndRecursiveProof,
  makePublicInputsAndRecursiveProof,
} from '@aztec/stdlib/interfaces/server';
import type { ParityPublicInputs } from '@aztec/stdlib/parity';
import { ProvingRequestType, makeRecursiveProof } from '@aztec/stdlib/proofs';
import { makeParityBasePrivateInputs, makeParityPublicInputs } from '@aztec/stdlib/testing';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import { jest } from '@jest/globals';

import { MockProver } from '../test/mock_prover.js';
import type { ProofStore } from './proof_store/index.js';
import { ProvingAgent } from './proving_agent.js';

describe('ProvingAgent', () => {
  let prover: MockProver;
  let jobSource: jest.Mocked<ProvingJobConsumer>;
  let agent: ProvingAgent;
  let proofDB: jest.Mocked<ProofStore>;
  const agentPollIntervalMs = 1000;
  let allowList: ProvingRequestType[];

  beforeEach(() => {
    jest.useFakeTimers();

    prover = new MockProver();
    jobSource = {
      getProvingJob: jest.fn(),
      reportProvingJobProgress: jest.fn(),
      reportProvingJobError: jest.fn(),
      reportProvingJobSuccess: jest.fn(),
    };
    proofDB = {
      getProofInput: jest.fn(),
      getProofOutput: jest.fn(),
      saveProofInput: jest.fn(() => Promise.resolve('' as ProofUri)),
      saveProofOutput: jest.fn(() => Promise.resolve('' as ProofUri)),
    };

    allowList = [ProvingRequestType.PARITY_BASE];
    agent = new ProvingAgent(jobSource, proofDB, prover, allowList, agentPollIntervalMs);
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('polls for jobs passing the permitted list of proofs', () => {
    agent.start();
    expect(jobSource.getProvingJob).toHaveBeenCalledWith({ allowList: [ProvingRequestType.PARITY_BASE] });
  });

  it('only takes a single job from the source at a time', async () => {
    expect(jobSource.getProvingJob).not.toHaveBeenCalled();

    // simulate the proof taking a long time
    const { promise, resolve } =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(promise);

    const { job, time, inputs } = makeBaseParityJob();
    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.getProvingJob).toHaveBeenCalledTimes(1);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.getProvingJob).toHaveBeenCalledTimes(1);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.getProvingJob).toHaveBeenCalledTimes(1);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(3);

    // let's resolve the proof
    const result = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
    resolve(result);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.getProvingJob).toHaveBeenCalledTimes(2);
  });

  it('reports success to the job source', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    const result = makeBaseParityResult();

    jest.spyOn(prover, 'getBaseParityProof').mockResolvedValueOnce(result);

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    proofDB.saveProofOutput.mockResolvedValueOnce('output-uri' as ProofUri);

    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(proofDB.saveProofOutput).toHaveBeenCalledWith(job.id, job.type, result);
    expect(jobSource.reportProvingJobSuccess).toHaveBeenCalledWith(job.id, 'output-uri', { allowList });
  });

  it('reports errors to the job source', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(new Error('test error'));

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, expect.stringContaining('test error'), false, {
      allowList,
    });
  });

  it('sets the retry flag on when reporting an error', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    const err = new ProvingError('test error', undefined, true);
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(err);

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, expect.stringContaining(err.message), true, {
      allowList,
    });
  });

  it('reports jobs in progress to the job source', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    const { promise, resolve } =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(promise);

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledWith(job.id, time, {
      allowList: [ProvingRequestType.PARITY_BASE],
    });

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledWith(job.id, time, {
      allowList: [ProvingRequestType.PARITY_BASE],
    });

    resolve(makeBaseParityResult());
  });

  it('abandons jobs if told so by the source', async () => {
    const firstJob = makeBaseParityJob();
    let firstProofAborted = false;
    const firstProof =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();

    // simulate a long running proving job that can be aborted
    jest.spyOn(prover, 'getBaseParityProof').mockImplementationOnce((_, signal) => {
      signal?.addEventListener('abort', () => {
        firstProof.reject(new AbortError('test abort'));
        firstProofAborted = true;
      });
      return firstProof.promise;
    });

    jobSource.getProvingJob.mockResolvedValueOnce({ job: firstJob.job, time: firstJob.time });
    proofDB.getProofInput.mockResolvedValueOnce(firstJob.inputs);
    agent.start();

    // now the agent should be happily proving and reporting progress
    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(1);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledWith(firstJob.job.id, firstJob.time, {
      allowList: [ProvingRequestType.PARITY_BASE],
    });

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(2);

    // now let's simulate the job source cancelling the job and giving the agent something else to do
    // this should cause the agent to abort the current job and start the new one
    const secondJobResponse = makeBaseParityJob();

    proofDB.getProofInput.mockResolvedValueOnce(secondJobResponse.inputs);

    const secondProof =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(secondProof.promise);

    jobSource.reportProvingJobProgress.mockResolvedValueOnce(secondJobResponse);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(4);
    expect(jobSource.reportProvingJobProgress).toHaveBeenNthCalledWith(3, firstJob.job.id, firstJob.time, {
      allowList: [ProvingRequestType.PARITY_BASE],
    });
    expect(jobSource.reportProvingJobProgress).toHaveBeenNthCalledWith(
      4,
      secondJobResponse.job.id,
      secondJobResponse.time,
      {
        allowList: [ProvingRequestType.PARITY_BASE],
      },
    );
    expect(firstProofAborted).toBe(true);

    // agent should have switched now
    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(5);
    expect(jobSource.reportProvingJobProgress).toHaveBeenLastCalledWith(
      secondJobResponse.job.id,
      secondJobResponse.time,
      {
        allowList: [ProvingRequestType.PARITY_BASE],
      },
    );
  });

  it('immediately starts working on the next job', async () => {
    const job1 = makeBaseParityJob();
    const job2 = makeBaseParityJob();

    jest
      .spyOn(prover, 'getBaseParityProof')
      .mockResolvedValueOnce(makeBaseParityResult())
      .mockResolvedValueOnce(makeBaseParityResult());

    proofDB.getProofInput.mockResolvedValueOnce(job1.inputs).mockResolvedValueOnce(job2.inputs);
    proofDB.saveProofOutput.mockResolvedValue('' as ProofUri);

    jobSource.getProvingJob.mockResolvedValueOnce(job1);
    jobSource.reportProvingJobSuccess.mockResolvedValueOnce(job2);

    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    await jest.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(jobSource.reportProvingJobSuccess).toHaveBeenCalledWith(job1.job.id, expect.any(String), { allowList });
    expect(jobSource.reportProvingJobSuccess).toHaveBeenCalledWith(job2.job.id, expect.any(String), { allowList });
  });

  it('immediately starts working after reporting an error', async () => {
    const job1 = makeBaseParityJob();
    const job2 = makeBaseParityJob();

    jest
      .spyOn(prover, 'getBaseParityProof')
      .mockRejectedValueOnce(new Error('test error'))
      .mockResolvedValueOnce(makeBaseParityResult());

    proofDB.getProofInput.mockResolvedValueOnce(job1.inputs).mockResolvedValueOnce(job2.inputs);
    proofDB.saveProofOutput.mockResolvedValue('' as ProofUri);

    jobSource.getProvingJob.mockResolvedValueOnce(job1);
    jobSource.reportProvingJobError.mockResolvedValueOnce(job2);

    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job1.job.id, expect.any(String), false, { allowList });
    expect(jobSource.reportProvingJobSuccess).toHaveBeenCalledWith(job2.job.id, expect.any(String), { allowList });
  });

  it('reports an error if inputs cannot be loaded', async () => {
    const { job, time } = makeBaseParityJob();
    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockRejectedValueOnce(new Error('Failed to load proof inputs'));

    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, 'Failed to load proof inputs', true, {
      allowList,
    });
  });

  function makeBaseParityJob(): { job: ProvingJob; time: number; inputs: ProvingJobInputs } {
    const time = jest.now();
    const inputs: ProvingJobInputs = { type: ProvingRequestType.PARITY_BASE, inputs: makeParityBasePrivateInputs() };
    const job: ProvingJob = {
      id: randomBytes(8).toString('hex') as ProvingJobId,
      epochNumber: 1,
      type: ProvingRequestType.PARITY_BASE,
      inputsUri: randomBytes(8).toString('hex') as ProofUri,
    };

    return { job, time, inputs };
  }

  function makeBaseParityResult() {
    return makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
  }
});
