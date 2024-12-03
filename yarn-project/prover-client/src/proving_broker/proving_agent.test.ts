import {
  type ProofUri,
  ProvingError,
  type ProvingJob,
  type ProvingJobConsumer,
  type ProvingJobId,
  type ProvingJobInputs,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  ReportProgressResponse,
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
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';

import { MockProver } from '../test/mock_prover.js';
import { type ProofStore } from './proof_store.js';
import { ProvingAgent } from './proving_agent.js';

describe('ProvingAgent', () => {
  let prover: MockProver;
  let jobSource: jest.Mocked<ProvingJobConsumer>;
  let agent: ProvingAgent;
  let proofDB: jest.Mocked<ProofStore>;
  const agentPollIntervalMs = 1000;

  beforeEach(() => {
    jest.useFakeTimers();

    prover = new MockProver();
    jobSource = {
      getProvingJob: jest.fn(),
      reportProvingJobProgress: jest.fn<any>().mockResolvedValue({ status: 'continue' } as ReportProgressResponse),
      reportProvingJobError: jest.fn(),
      reportProvingJobSuccess: jest.fn(),
    };
    proofDB = {
      getProofInput: jest.fn(),
      getProofOutput: jest.fn(),
      saveProofInput: jest.fn(),
      saveProofOutput: jest.fn(),
    };

    agent = new ProvingAgent(jobSource, proofDB, prover, new NoopTelemetryClient(), [ProvingRequestType.BASE_PARITY]);
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

    const { job, time, inputs } = makeBaseParityJob();
    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
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
    const { job, time, inputs } = makeBaseParityJob();
    const result = makeBaseParityResult();

    jest.spyOn(prover, 'getBaseParityProof').mockResolvedValueOnce(result);

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    proofDB.saveProofOutput.mockResolvedValueOnce('output-uri' as ProofUri);

    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(proofDB.saveProofOutput).toHaveBeenCalledWith(job.id, job.type, result);
    expect(jobSource.reportProvingJobSuccess).toHaveBeenCalledWith(job.id, 'output-uri');
  });

  it('reports errors to the job source', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(new Error('test error'));

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, 'test error', false);
  });

  it('sets the retry flag on when reporting an error', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    const err = new ProvingError('test error', undefined, true);
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(err);

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, err.message, true);
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
      allowList: [ProvingRequestType.BASE_PARITY],
    });

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledWith(job.id, time, {
      allowList: [ProvingRequestType.BASE_PARITY],
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
      allowList: [ProvingRequestType.BASE_PARITY],
    });

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(2);

    // now let's simulate the job source cancelling the job and giving the agent something else to do
    // this should cause the agent to abort the current job and start the new one
    const newJob = makeBaseParityJob();
    const secondJobResponse: ReportProgressResponse = { status: 'abort', ...newJob };

    jobSource.reportProvingJobProgress.mockResolvedValueOnce(secondJobResponse);
    proofDB.getProofInput.mockResolvedValueOnce(newJob.inputs);

    const secondProof =
      promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(secondProof.promise);

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(3);
    expect(jobSource.reportProvingJobProgress).toHaveBeenLastCalledWith(firstJob.job.id, firstJob.time, {
      allowList: [ProvingRequestType.BASE_PARITY],
    });
    expect(firstProofAborted).toBe(true);

    // agent should have switched now
    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobProgress).toHaveBeenCalledTimes(4);
    expect(jobSource.reportProvingJobProgress).toHaveBeenLastCalledWith(newJob.job.id, newJob.time, {
      allowList: [ProvingRequestType.BASE_PARITY],
    });

    secondProof.resolve(makeBaseParityResult());
  });

  it('reports an error if inputs cannot be loaded', async () => {
    const { job, time } = makeBaseParityJob();
    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockRejectedValueOnce(new Error('Failed to load proof inputs'));

    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, 'Failed to load proof inputs', true);
  });

  function makeBaseParityJob(): { job: ProvingJob; time: number; inputs: ProvingJobInputs } {
    const time = jest.now();
    const inputs: ProvingJobInputs = { type: ProvingRequestType.BASE_PARITY, inputs: makeBaseParityInputs() };
    const job: ProvingJob = {
      id: randomBytes(8).toString('hex') as ProvingJobId,
      blockNumber: 1,
      type: ProvingRequestType.BASE_PARITY,
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
