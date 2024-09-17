import assert from 'assert/strict';

import type { ProofOutputs, ProofRequest, ProofRequestId, ProofResult, ProofType } from '../proof_request.js';
import { type BrokerBackend } from './interface.js';

export class InMemoryBrokerBackend implements BrokerBackend {
  private items = new Map<ProofRequestId, ProofRequest<ProofType>>();
  private results = new Map<ProofRequestId, ProofResult<ProofType>>();

  saveProofRequest<T extends ProofType>(request: ProofRequest<T>): Promise<void> {
    if (this.items.has(request.id)) {
      const existing = this.items.get(request.id);
      assert.deepStrictEqual(existing, request, 'Conflicting proof request ID');
      return Promise.resolve();
    }

    this.items.set(request.id, request);
    return Promise.resolve();
  }

  saveProofRequestResult<T extends ProofType>(id: ProofRequestId, proofType: T, value: ProofOutputs[T]): Promise<void> {
    assert.equal(this.items.get(id)?.proofType, proofType, 'Proof type mismatch');
    this.results.set(id, { value, id, proofType });
    return Promise.resolve();
  }

  saveProofRequestError<T extends ProofType>(id: ProofRequestId, proofType: T, error: Error): Promise<void> {
    assert.equal(this.items.get(id)?.proofType, proofType, 'Proof type mismatch');
    this.results.set(id, { error, id, proofType });
    return Promise.resolve();
  }

  getProofRequest<T extends ProofType>(id: ProofRequestId, proofType: ProofType): ProofRequest<T> | undefined {
    const item = this.items.get(id);
    if (item) {
      assert.equal(item.proofType, proofType, `Proof type mismatch id=${id}`);
      return item as ProofRequest<T>;
    }
    return undefined;
  }

  getProofResult<T extends ProofType>(id: ProofRequestId, proofType: T): ProofResult<T> | undefined {
    const res = this.results.get(id);
    if (res) {
      assert.equal(res.proofType, proofType, `Proof type mismatch id=${id}`);
      return res as ProofResult<T>;
    }
    return undefined;
  }

  removeProofRequest(id: ProofRequestId): Promise<void> {
    this.items.delete(id);
    return Promise.resolve();
  }

  allProofRequests(): Iterable<ProofRequest<ProofType>> {
    return this.items.values();
  }
}
