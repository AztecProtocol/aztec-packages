import { ProvingRequestType, type V2ProvingJobId, makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import { makeBaseParityInputs, makeParityPublicInputs } from '@aztec/circuits.js/testing';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';

import { MockProver } from '../test/mock_prover.js';
import { ProvingJobController, ProvingJobStatus } from './proving_job_controller.js';

describe('ProvingJobController', () => {
  let prover: MockProver;
  let onComplete: jest.Mock<any>;
  let controller: ProvingJobController;

  beforeEach(() => {
    prover = new MockProver();
    onComplete = jest.fn();
    controller = new ProvingJobController(
      '1' as V2ProvingJobId,
      {
        type: ProvingRequestType.BASE_PARITY,
        value: makeBaseParityInputs(),
      },
      0,
      prover,
      onComplete,
    );
  });

  it('reports IDLE status initially', () => {
    expect(controller.getStatus()).toBe(ProvingJobStatus.IDLE);
  });

  it('reports PROVING status while busy', () => {
    controller.start();
    expect(controller.getStatus()).toBe(ProvingJobStatus.PROVING);
  });

  it('reports DONE status after job is done', async () => {
    controller.start();
    await sleep(1); // give promises a chance to complete
    expect(controller.getStatus()).toBe(ProvingJobStatus.DONE);
  });

  it('calls onComplete with the proof', async () => {
    const resp = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
    jest.spyOn(prover, 'getBaseParityProof').mockResolvedValueOnce(resp);

    controller.start();
    await sleep(1); // give promises a chance to complete
    expect(onComplete).toHaveBeenCalledWith('1', undefined, {
      type: ProvingRequestType.BASE_PARITY,
      value: resp,
    });
  });

  it('calls onComplete with the error', async () => {
    const err = new Error('test error');
    jest.spyOn(prover, 'getBaseParityProof').mockRejectedValueOnce(err);

    controller.start();
    await sleep(1);
    expect(onComplete).toHaveBeenCalledWith('1', err, undefined);
  });

  it('does not crash if onComplete throws', async () => {
    const err = new Error('test error');
    onComplete.mockImplementationOnce(() => {
      throw err;
    });

    controller.start();
    await sleep(1);
    expect(onComplete).toHaveBeenCalled();
  });

  it('does not crash if onComplete rejects', async () => {
    const err = new Error('test error');
    onComplete.mockRejectedValueOnce(err);

    controller.start();
    await sleep(1);
    expect(onComplete).toHaveBeenCalled();
  });
});
