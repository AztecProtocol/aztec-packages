import type { ProofOutputs, ProofRequest, ProofRequestId, ProofResult, ProofType } from '../proof_request.js';

export interface BrokerBackend {
  /**
   * Saves a proof request so it can be retrieved later
   * @param request - The proof request to save
   */
  saveProofRequest<T extends ProofType>(request: ProofRequest<T>): Promise<void>;

  /**
   * Saves the result of a proof request
   * @param id - The ID of the proof request to save the result for
   * @param proofType - The type of proof that was requested
   * @param result - The result of the proof request
   */
  saveProofRequestResult<T extends ProofType>(id: ProofRequestId, proofType: T, result: ProofOutputs[T]): Promise<void>;

  /**
   * Saves an error that occurred while processing a proof request
   * @param id - The ID of the proof request to save the error for
   * @param proofType - The type of proof that was requested
   * @param err - The error that occurred while processing the proof request
   */
  saveProofRequestError<T extends ProofType>(id: ProofRequestId, proofType: T, err: Error): Promise<void>;

  /**
   * Gets a proof request by its ID. Returns undefined if the proof request does not exist
   * @param id - The ID of the proof request to retrieve
   */
  getProofRequest<T extends ProofType>(id: ProofRequestId, proofType: T): ProofRequest<T> | undefined;

  /**
   * Returns the saved result of a proof request. Returns undefined if the result does not exist.
   * @param id - The ID of the proof request to get the result for
   * @param proofType - The type of proof that was requested
   */
  getProofResult<T extends ProofType>(id: ProofRequestId, proofType: T): ProofResult<T> | undefined;

  /**
   * Removes a proof request from the backend
   * @param id - The ID of the proof request to remove
   */
  removeProofRequest(id: ProofRequestId): Promise<void>;

  allProofRequests(): Iterable<ProofRequest<ProofType>>;
}
