import {
  type ProofUri,
  type ProvingJobId,
  ProvingJobInputs,
  type ProvingJobInputsMap,
  ProvingJobResult,
  type ProvingJobResultsMap,
  type ProvingRequestType,
} from '@aztec/circuit-types';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type ZodFor } from '@aztec/foundation/schemas';

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

// use an ASCII encoded data uri https://datatracker.ietf.org/doc/html/rfc2397#section-2
// we do this to avoid double encoding to base64 (since the inputs already serialize to a base64 string)
const PREFIX = 'data:application/json;charset=utf-8';
const SEPARATOR = ',';

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
    return Promise.resolve(this.encode(jobInputs));
  }

  saveProofOutput<T extends ProvingRequestType>(
    _id: ProvingJobId,
    type: T,
    result: ProvingJobResultsMap[T],
  ): Promise<ProofUri> {
    const jobResult = { type, result } as ProvingJobResult;
    return Promise.resolve(this.encode(jobResult));
  }

  getProofInput(uri: ProofUri): Promise<ProvingJobInputs> {
    return Promise.resolve(this.decode(uri, ProvingJobInputs));
  }

  getProofOutput(uri: ProofUri): Promise<ProvingJobResult> {
    return Promise.resolve(this.decode(uri, ProvingJobResult));
  }

  private encode(obj: object): ProofUri {
    const encoded = encodeURIComponent(jsonStringify(obj));
    return (PREFIX + SEPARATOR + encoded) as ProofUri;
  }

  private decode<T>(uri: ProofUri, schema: ZodFor<T>): T {
    const [prefix, data] = uri.split(SEPARATOR);
    if (prefix !== PREFIX) {
      throw new Error('Invalid proof input URI: ' + prefix);
    }

    return jsonParseWithSchema(decodeURIComponent(data), schema);
  }
}
