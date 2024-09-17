import type { ProofOutputs, ProofRequest, ProofRequestId, ProofRequestStatus, ProofType } from './proof_request.js';

export interface ProofRequestProducer {
  enqueueProof<T extends ProofType>(request: ProofRequest<T>): Promise<void>;
  cancelProof(id: ProofRequestId): Promise<void>;
  getProofStatus<T extends ProofType>(id: ProofRequestId, proofType: T): Promise<ProofRequestStatus<T>>;
}

export interface ProofRequestFilter<T extends ProofType[]> {
  allowList?: T;
}

export interface ProofRequestConsumer {
  getProofRequest<T extends ProofType[]>(filter?: ProofRequestFilter<T>): Promise<ProofRequest<T[number]> | undefined>;
  reportResult<T extends ProofType>(id: ProofRequestId, proofType: T, result: ProofOutputs[T]): Promise<void>;
  reportError<T extends ProofType>(id: ProofRequestId, proofType: T, err: Error): Promise<void>;
  reportProgress<T extends ProofType[]>(
    id: ProofRequestId,
    filter: ProofRequestFilter<T>,
  ): Promise<ProofRequest<T[number]> | undefined>;
}
