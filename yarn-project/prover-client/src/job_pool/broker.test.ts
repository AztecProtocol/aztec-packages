import { makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBaseParityInputs,
  makeBaseRollupInputs,
  makeRootParityInput,
} from '@aztec/circuits.js/testing';

import { jest } from '@jest/globals';

import { ProofRequestBroker } from './broker.js';
import { InMemoryBrokerBackend } from './broker_backend/in_memory.js';
import { type BrokerBackend } from './broker_backend/interface.js';
import { type ProofRequest, ProofType, makeProofRequestId } from './proof_request.js';

beforeAll(() => {
  jest.useFakeTimers();
});

describe('ProofRequestBroker', () => {
  let broker: ProofRequestBroker;
  let timeoutMs: number;
  let maxRetries: number;

  beforeEach(async () => {
    timeoutMs = 300;
    maxRetries = 2;
    broker = new ProofRequestBroker(new InMemoryBrokerBackend(), {
      proofRequestTimeoutMs: timeoutMs,
      timeoutIntervalMs: timeoutMs / 3,
      maxRetries,
    });

    await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
  });

  describe('Basic API', () => {
    it('enqueues proof requests', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      const anotherProofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 2,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      const yetAnotherProofRequest: ProofRequest<ProofType.BaseRollupProof> = {
        id: makeProofRequestId(),
        blockNumber: 3,
        proofType: ProofType.BaseRollupProof,
        inputs: makeBaseRollupInputs(),
      };

      await broker.enqueueProof(proofRequest);
      await broker.enqueueProof(anotherProofRequest);
      await broker.enqueueProof(yetAnotherProofRequest);

      expect(await broker.getProofStatus(proofRequest.id, proofRequest.proofType)).toEqual({ status: 'in-queue' });
      expect(await broker.getProofStatus(anotherProofRequest.id, anotherProofRequest.proofType)).toEqual({
        status: 'in-queue',
      });
      expect(await broker.getProofStatus(yetAnotherProofRequest.id, yetAnotherProofRequest.proofType)).toEqual({
        status: 'in-queue',
      });
    });

    it('panics if the expected proof type does not match the actual proof type', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);
      await expect(broker.getProofStatus(proofRequest.id, ProofType.BlockRootRollupProof)).rejects.toThrow(
        'Proof type mismatch',
      );
    });

    it('silently ignores duplicates', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);
      await broker.enqueueProof(proofRequest);

      expect(await broker.getProofStatus(proofRequest.id, proofRequest.proofType)).toEqual({ status: 'in-queue' });
    });

    it('panics if two proof requests have the same ID', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);

      const anotherProofRequest: ProofRequest<ProofType.BaseRollupProof> = {
        id: proofRequest.id, // same ID
        blockNumber: 2,
        proofType: ProofType.BaseRollupProof,
        inputs: makeBaseRollupInputs(),
      };

      await expect(broker.enqueueProof(anotherProofRequest)).rejects.toThrow('Conflicting proof request ID');
    });

    it('returns not-found status for non-existing proof request', async () => {
      const status = await broker.getProofStatus(makeProofRequestId(), ProofType.BaseParityProof);
      expect(status).toEqual({ status: 'not-found' });
    });

    it('should cancel proof request', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);
      await broker.cancelProof(proofRequest.id);

      const status = await broker.getProofStatus(proofRequest.id, proofRequest.proofType);
      expect(status).toEqual({ status: 'not-found' });
    });

    it('offers proof requests in priority order', async () => {
      const proofRequest1: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      const proofRequest2: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 2,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      const proofRequest3: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 3,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest2);
      await broker.enqueueProof(proofRequest3);
      await broker.enqueueProof(proofRequest1);

      const proofRequest = await broker.getProofRequest({ allowList: [ProofType.BaseParityProof] });
      expect(proofRequest).toEqual(proofRequest1);
    });

    it('offers proof requests in priority order and respects allowList', async () => {
      const proofRequest1: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      const proofRequest2: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 2,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      const proofRequest3: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 3,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest2);
      await broker.enqueueProof(proofRequest3);
      await broker.enqueueProof(proofRequest1);

      const proofRequest = await broker.getProofRequest({ allowList: [ProofType.BaseRollupProof] });
      expect(proofRequest).toBeUndefined();
    });

    it('returns undefined if no proof requests are available', async () => {
      const proofRequest = await broker.getProofRequest({ allowList: [ProofType.BaseParityProof] });
      expect(proofRequest).toBeUndefined();
    });

    it('returns undefined if no proof requests are available for the given allowList', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);

      const proofRequest2 = await broker.getProofRequest({ allowList: [ProofType.BaseRollupProof] });
      expect(proofRequest2).toBeUndefined();
    });

    it('reports proof results', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);
      const value = makeRootParityInput(RECURSIVE_PROOF_LENGTH);
      await broker.reportResult(proofRequest.id, proofRequest.proofType, value);

      const status = await broker.getProofStatus(proofRequest.id, proofRequest.proofType);
      expect(status).toEqual({ status: 'resolved', value });
    });

    it('reports proof errors', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);
      const error = new Error('test error');
      await broker.reportError(proofRequest.id, proofRequest.proofType, error);

      const status = await broker.getProofStatus(proofRequest.id, proofRequest.proofType);
      expect(status).toEqual({ status: 'rejected', error });
    });
  });
  describe('Timeouts', () => {
    it('tracks in progress proof requests', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-queue',
      });

      await expect(broker.getProofRequest()).resolves.toEqual(proofRequest);

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-progress',
      });
    });

    it('re-enqueues proof requests that time out', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-queue',
      });

      await expect(broker.getProofRequest()).resolves.toEqual(proofRequest);
      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-progress',
      });

      await jest.advanceTimersByTimeAsync(timeoutMs);

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-queue',
      });
    });
  });

  describe('Proof errors and retries', () => {
    it('retries proof requests', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-queue',
      });

      await expect(broker.getProofRequest()).resolves.toEqual(proofRequest);

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-progress',
      });

      await broker.reportError(proofRequest.id, proofRequest.proofType, new Error('test error'), true);

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'in-queue',
      });
    });

    it('retries up to a maximum number of times', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);

      for (let i = 0; i < maxRetries; i++) {
        await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
          status: 'in-queue',
        });
        await expect(broker.getProofRequest()).resolves.toEqual(proofRequest);
        await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
          status: 'in-progress',
        });
        await broker.reportError(proofRequest.id, proofRequest.proofType, new Error('test error'), true);
      }
      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'rejected',
        error: new Error('test error'),
      });
    });

    it('passing retry=false does not retry', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);

      await expect(broker.getProofRequest()).resolves.toEqual(proofRequest);
      await broker.reportError(proofRequest.id, proofRequest.proofType, new Error('test error'), false);
      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'rejected',
        error: new Error('test error'),
      });
    });

    it('can report error even if job not started', async () => {
      const proofRequest: ProofRequest<ProofType.BaseParityProof> = {
        id: makeProofRequestId(),
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProof(proofRequest);
      await broker.reportError(proofRequest.id, proofRequest.proofType, new Error('test error'));

      await expect(broker.getProofStatus(proofRequest.id, proofRequest.proofType)).resolves.toEqual({
        status: 'rejected',
        error: new Error('test error'),
      });
    });
  });

  describe('State restore', () => {
    let backend: BrokerBackend;
    let broker: ProofRequestBroker;

    beforeEach(() => {
      backend = new InMemoryBrokerBackend();
      broker = new ProofRequestBroker(backend, {
        proofRequestTimeoutMs: timeoutMs,
        timeoutIntervalMs: timeoutMs / 3,
        maxRetries,
      });
    });

    afterEach(async () => {
      await broker.stop();
    });

    it('re-enqueues proof requests on start', async () => {
      const id1 = makeProofRequestId();

      await backend.saveProofRequest({
        id: id1,
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      });

      const id2 = makeProofRequestId();
      await backend.saveProofRequest({
        id: id2,
        blockNumber: 2,
        proofType: ProofType.BaseRollupProof,
        inputs: makeBaseRollupInputs(),
      });

      await broker.start();

      await expect(broker.getProofStatus(id1, ProofType.BaseParityProof)).resolves.toEqual({ status: 'in-queue' });
      await expect(broker.getProofStatus(id2, ProofType.BaseRollupProof)).resolves.toEqual({ status: 'in-queue' });

      await expect(broker.getProofRequest({ allowList: [ProofType.BaseParityProof] })).resolves.toEqual({
        id: id1,
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: expect.any(Object),
      });

      await expect(broker.getProofRequest()).resolves.toEqual({
        id: id2,
        blockNumber: 2,
        proofType: ProofType.BaseRollupProof,
        inputs: expect.any(Object),
      });

      await expect(broker.getProofStatus(id1, ProofType.BaseParityProof)).resolves.toEqual({ status: 'in-progress' });
      await expect(broker.getProofStatus(id2, ProofType.BaseRollupProof)).resolves.toEqual({ status: 'in-progress' });
    });

    it('restores proof results on start', async () => {
      const id1 = makeProofRequestId();

      await backend.saveProofRequest({
        id: id1,
        blockNumber: 1,
        proofType: ProofType.BaseParityProof,
        inputs: makeBaseParityInputs(),
      });

      const id2 = makeProofRequestId();
      await backend.saveProofRequest({
        id: id2,
        blockNumber: 2,
        proofType: ProofType.BaseRollupProof,
        inputs: makeBaseRollupInputs(),
      });

      await backend.saveProofRequestResult(id1, ProofType.BaseParityProof, makeRootParityInput(RECURSIVE_PROOF_LENGTH));

      await backend.saveProofRequestResult(
        id2,
        ProofType.BaseRollupProof,
        makePublicInputsAndRecursiveProof(
          makeBaseOrMergeRollupPublicInputs(),
          makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
          VerificationKeyData.makeFake(),
        ),
      );

      await broker.start();

      await expect(broker.getProofStatus(id1, ProofType.BaseParityProof)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(Object),
      });

      await expect(broker.getProofStatus(id2, ProofType.BaseRollupProof)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(Object),
      });
    });
  });
});
