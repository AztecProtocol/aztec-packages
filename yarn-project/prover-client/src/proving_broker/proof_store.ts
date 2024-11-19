import {
  type ProofUri,
  type ProvingJobId,
  ProvingJobInputs,
  type ProvingJobInputsMap,
  ProvingJobResult,
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

const PREFIX = 'data:application/json;base64';
const SEPARATOR = ',';
const BUFFER_ENCODING = 'base64url';

/**
 * An implementation of a proof input/output database that stores data inline in the URI.
 */
export class InlineProofStore implements ProofStore {
  saveProofInput<T extends ProvingRequestType>(
    _id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
  ): Promise<ProofUri> {
    const jobInputs = { type, inputs } as ProvingJobInputs;
    return Promise.resolve(
      (PREFIX + SEPARATOR + Buffer.from(JSON.stringify(jobInputs)).toString(BUFFER_ENCODING)) as ProofUri,
    );
  }

  saveProofOutput<T extends ProvingRequestType>(
    _id: ProvingJobId,
    type: T,
    result: ProvingJobResultsMap[T],
  ): Promise<ProofUri> {
    const jobResult = { type, result } as ProvingJobResult;
    return Promise.resolve(
      (PREFIX + SEPARATOR + Buffer.from(JSON.stringify(jobResult)).toString(BUFFER_ENCODING)) as ProofUri,
    );
  }

  getProofInput(uri: ProofUri): Promise<ProvingJobInputs> {
    const [prefix, data] = uri.split(SEPARATOR);
    if (prefix !== PREFIX) {
      throw new Error('Invalid proof input URI: ' + prefix);
    }

    return Promise.resolve(ProvingJobInputs.parse(JSON.parse(Buffer.from(data, BUFFER_ENCODING).toString())));
  }

  getProofOutput(uri: ProofUri): Promise<ProvingJobResult> {
    const [prefix, data] = uri.split(SEPARATOR);
    if (prefix !== PREFIX) {
      throw new Error('Invalid proof output URI: ' + prefix);
    }

    return Promise.resolve(ProvingJobResult.parse(JSON.parse(Buffer.from(data, BUFFER_ENCODING).toString())));
  }
}
