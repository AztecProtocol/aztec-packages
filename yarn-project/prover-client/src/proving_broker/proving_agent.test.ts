import {
  ProvingError,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type V2ProofInput,
  type V2ProofInputUri,
  type V2ProofOutputUri,
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
import { type ProofInputOutputDatabase } from './proof_input_output_database.js';
import { ProvingAgent } from './proving_agent.js';
import { type ProvingJobConsumer } from './proving_broker_interface.js';

describe('ProvingAgent', () => {
  let prover: MockProver;
  let jobSource: jest.Mocked<ProvingJobConsumer>;
  let agent: ProvingAgent;
  let proofDB: jest.Mocked<ProofInputOutputDatabase>;
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
    proofDB = {
      getProofInput: jest.fn(),
      getProofOutput: jest.fn(),
      saveProofInput: jest.fn(),
      saveProofOutput: jest.fn(),
    };

    agent = new ProvingAgent(jobSource, proofDB, prover, [ProvingRequestType.BASE_PARITY]);
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

    jest.spyOn(prover, 'getBaseParityProof').mockResolvedValueOnce(result.value);

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    proofDB.saveProofOutput.mockResolvedValueOnce('output-uri' as V2ProofOutputUri);

    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(proofDB.saveProofOutput).toHaveBeenCalledWith(result);
    expect(jobSource.reportProvingJobSuccess).toHaveBeenCalledWith(job.id, 'output-uri');
  });

  it('reports errors to the job source', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(new Error('test error'));

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, new Error('test error'), false);
  });

  it('sets the retry flag on when reporting an error', async () => {
    const { job, time, inputs } = makeBaseParityJob();
    const err = new ProvingError('test error', undefined, true);
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(err);

    jobSource.getProvingJob.mockResolvedValueOnce({ job, time });
    proofDB.getProofInput.mockResolvedValueOnce(inputs);
    agent.start();

    await jest.advanceTimersByTimeAsync(agentPollIntervalMs);
    expect(jobSource.reportProvingJobError).toHaveBeenCalledWith(job.id, err, true);
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

    resolve(makeBaseParityResult().value);
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
    const secondJobResponse = makeBaseParityJob();

    jobSource.reportProvingJobProgress.mockResolvedValueOnce(secondJobResponse);
    proofDB.getProofInput.mockResolvedValueOnce(secondJobResponse.inputs);

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
    expect(jobSource.reportProvingJobProgress).toHaveBeenLastCalledWith(
      secondJobResponse.job.id,
      secondJobResponse.time,
      {
        allowList: [ProvingRequestType.BASE_PARITY],
      },
    );

    secondProof.resolve(makeBaseParityResult().value);
  });

  function makeBaseParityJob(): { job: V2ProvingJob; time: number; inputs: V2ProofInput } {
    const time = jest.now();
    const inputs: V2ProofInput = { type: ProvingRequestType.BASE_PARITY, value: makeBaseParityInputs() };
    const job: V2ProvingJob = {
      id: randomBytes(8).toString('hex') as V2ProvingJobId,
      blockNumber: 1,
      type: ProvingRequestType.BASE_PARITY,
      inputs: randomBytes(8).toString('hex') as V2ProofInputUri,
    };

    return { job, time, inputs };
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
