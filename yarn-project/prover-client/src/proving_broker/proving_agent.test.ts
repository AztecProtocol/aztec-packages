import {
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type V2ProvingJob,
  type V2ProvingJobId,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  type ParityPublicInputs,
  RECURSIVE_PROOF_LENGTH,
  VerificationKeyData,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import { makeBaseParityInputs, makeParityPublicInputs } from '@aztec/circuits.js/testing';
import { randomBytes } from '@aztec/foundation/crypto';
import { AbortError } from '@aztec/foundation/error';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { jest } from '@jest/globals';

import { MockProver } from '../test/mock_prover.js';
import { ProvingAgent } from './proving_agent.js';
import { type ProvingJobConsumer } from './proving_broker_interface.js';

describe('ProvingAgent', () => {
  let prover: MockProver;
  let jobSource: jest.Mocked<ProvingJobConsumer>;
  let agent: ProvingAgent;
  const agentPollIntervalMs = 1000;

  beforeEach(() => {
    jest.useFakeTimers();

    prover = new MockProver();
    jobSource = {
      getProvingJob: jest.fn(),
      reportProvingJobProgress: jest.fn(),
      reportProvingJobError: jest.fn(),
      reportProvingJobSuccess: jest.fn(),
    };
    agent = new ProvingAgent(jobSource, prover, [ProvingRequestType.BASE_PARITY]);
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('polls for jobs passing the permitted list of proofs', () => {
    agent.start();
    expect(jobSource.getProvingJob).toHaveBeenCalledWith({ allowList: [ProvingRequestType.BASE_PARITY] });
  });

  it('only takes a single job from the source at a time', async () => {
    expect(jobSource.getProvingJob).not.toHaveBeenCalled();

    // simulate the proof taking a long time
    const { promise, resolve } =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(promise);

    const jobResponse = makeBaseParityJob();
    jobSource.getProvingJob.mockResolvedValueOnce(jobResponse);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.getProvingJob).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.getProvingJob).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.getProvingJob).toHaveBeenCalledTimes(1);

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
    const jobResponse = makeBaseParityJob();
    const result = makeBaseParityResult();
    jest.spyOn(prover, 'getBaseParityProof').mockResolvedValueOnce(result.value);

    jobSource.getProvingJob.mockResolvedValueOnce(jobResponse);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobSuccess).toHaveBeenCalledWith(jobResponse.job.id, result);
  });

  it('reports errors to the job source', async () => {
    const jobResponse = makeBaseParityJob();
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(new Error('test error'));

    jobSource.getProvingJob.mockResolvedValueOnce(jobResponse);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(jobResponse.job.id, new Error('test error'));
  });

  it('reports jobs in progress to the job source', async () => {
    const jobResponse = makeBaseParityJob();
    const { promise, resolve } =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(promise);

    jobSource.getProvingJob.mockResolvedValueOnce(jobResponse);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledWith(jobResponse.job.id, jobResponse.time, {
      allowList: [ProvingRequestType.BASE_PARITY],
    });

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledWith(jobResponse.job.id, jobResponse.time, {
      allowList: [ProvingRequestType.BASE_PARITY],
    });

    resolve(makeBaseParityResult().value);
  });

  it('abandons jobs if told so by the source', async () => {
    const firstJobResponse = makeBaseParityJob();
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

    jobSource.getProvingJob.mockResolvedValueOnce(firstJobResponse);
    agent.start();

    // now the agent should be happily proving and reporting progress
    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(1);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledWith(firstJobResponse.job.id, firstJobResponse.time, {
      allowList: [ProvingRequestType.BASE_PARITY],
    });

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(2);

    // now let's simulate the job source cancelling the job and giving the agent something else to do
    // this should cause the agent to abort the current job and start the new one
    const secondJobResponse = makeBaseParityJob();
    jobSource.reportProvingJobProgress.mockResolvedValueOnce(secondJobResponse);

    const secondProof =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(secondProof.promise);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(3);
    expect(jobSource.reportProvingJobProgress).toHaveBeenLastCalledWith(
      firstJobResponse.job.id,
      firstJobResponse.time,
      {
        allowList: [ProvingRequestType.BASE_PARITY],
      },
    );
    expect(firstProofAborted).toBe(true);

    // agent should have switched now
    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(4);
    expect(jobSource.reportProvingJobProgress).toHaveBeenLastCalledWith(
      secondJobResponse.job.id,
      secondJobResponse.time,
      {
        allowList: [ProvingRequestType.BASE_PARITY],
      },
    );

    secondProof.resolve(makeBaseParityResult().value);
  });

  function makeBaseParityJob(): { job: V2ProvingJob; time: number } {
    const time = jest.now();
    const job: V2ProvingJob = {
      id: randomBytes(8).toString('hex') as V2ProvingJobId,
      blockNumber: 1,
      type: ProvingRequestType.BASE_PARITY,
      inputs: makeBaseParityInputs(),
    };

    return { job, time };
  }

  function makeBaseParityResult() {
    const value = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
    return { type: ProvingRequestType.BASE_PARITY, value };
  }
});
