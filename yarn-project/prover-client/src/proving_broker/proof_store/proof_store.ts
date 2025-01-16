import {
  type ProofUri,
  type ProvingJobId,
  type ProvingJobInputs,
  type ProvingJobInputsMap,
  type ProvingJobResult,
  type ProvingJobResultsMap,
  type ProvingRequestType,
} from '@aztec/circuit-types';

/**
 * A database for storing proof inputs and outputs.
 */
export interface ProofStore {
  /**
   * Save a proof input to the database.
   * @param jobId - The ID of the job the proof input is associated with.
   * @param type - The type of the proving request.
   * @param inputs - The proof input to save.
   * @returns The URI of the saved proof input.
   */
  saveProofInput<T extends ProvingRequestType>(
    jobId: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
  ): Promise<ProofUri>;

  /**
   * Save a proof output to the database.
   * @param jobId - The ID of the job the proof input is associated with.
   * @param type - The type of the proving request.
   * @param result - The proof output to save.
   * @returns The URI of the saved proof output.
   */
  saveProofOutput<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    result: ProvingJobResultsMap[T],
  ): Promise<ProofUri>;

  /**
   * Retrieve a proof input from the database.
   * @param uri - The URI of the proof input to retrieve.
   * @returns The proof input.
   */
  getProofInput(uri: ProofUri): Promise<ProvingJobInputs>;

  /**
   * Retrieve a proof output from the database.
   * @param uri - The URI of the proof output to retrieve.
   * @returns The proof output.
   */
  getProofOutput(uri: ProofUri): Promise<ProvingJobResult>;
}
