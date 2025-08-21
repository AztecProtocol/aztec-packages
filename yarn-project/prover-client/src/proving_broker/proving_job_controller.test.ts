import { RECURSIVE_PROOF_LENGTH } from '@aztec/constants';
import { AbortError } from '@aztec/foundation/error';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { type ProvingJobId, makePublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType, makeRecursiveProof } from '@aztec/stdlib/proofs';
import { makeParityBasePrivateInputs, makeParityPublicInputs } from '@aztec/stdlib/testing';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import { jest } from '@jest/globals';

import { MockProver } from '../test/mock_prover.js';
import { ProvingJobController, ProvingJobControllerStatus } from './proving_job_controller.js';

describe('ProvingJobController', () => {
  let prover: MockProver;
  let onComplete: jest.Mock<any>;
  let controller: ProvingJobController;

  beforeEach(() => {
    prover = new MockProver();
    onComplete = jest.fn();
    controller = new ProvingJobController(
      '1' as ProvingJobId,
      {
        type: ProvingRequestType.PARITY_BASE,
        inputs: makeParityBasePrivateInputs(),
      },
      42,
      0,
      prover,
      onComplete,
    );
  });

  it('reports IDLE status initially', () => {
    expect(controller.getStatus()).toBe(ProvingJobControllerStatus.IDLE);
  });

  it('reports PROVING status while busy', () => {
    controller.start();
    expect(controller.getStatus()).toBe(ProvingJobControllerStatus.RUNNING);
  });

  it('reports DONE status after job is done', async () => {
    controller.start();
    await sleep(1); // give promises a chance to complete
    expect(controller.getStatus()).toBe(ProvingJobControllerStatus.DONE);
  });

  it('reports aborted error after cancellation', async () => {
    controller.start();
    controller.abort();
    await sleep(1); // give promises a chance to complete
    expect(controller.getStatus()).toBe(ProvingJobControllerStatus.DONE);
    expect(controller.getResult()).toBeInstanceOf(AbortError);
  });

  it('calls onComplete', async () => {
    const resp = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
    jest.spyOn(prover, 'getBaseParityProof').mockResolvedValueOnce(resp);

    controller.start();
    await sleep(1); // give promises a chance to complete
    expect(onComplete).toHaveBeenCalled();
    expect(controller.getResult()).toEqual(resp);
  });

  it('calls onComplete with the error', async () => {
    const err = new Error('test error');
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(err);

    controller.start();
    await sleep(1);
    expect(onComplete).toHaveBeenCalled();
    expect(controller.getResult()).toEqual(err);
  });

  it('does not crash if onComplete throws', async () => {
    const err = new Error('test error');
    onComplete.mockImplementationOnce(() => {
      throw err;
    });

    controller.start();
    await sleep(1);
    expect(onComplete).toHaveBeenCalled();
    expect(controller.getResult()).toBeDefined();
  });

  it('calls onComplete if abort is called but result is masked', async () => {
    const { promise, resolve } = promiseWithResolvers<any>();
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValueOnce(promise);

    controller.start();

    await sleep(1);
    expect(onComplete).not.toHaveBeenCalled();

    controller.abort();
    await sleep(1);
    expect(onComplete).not.toHaveBeenCalled();

    // simulate a prover that does not respect signals, still completes the proof after aborting
    resolve(
      makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );

    await sleep(1);
    expect(onComplete).toHaveBeenCalled();
    expect(controller.getResult()).toBeInstanceOf(AbortError);
  });
});
