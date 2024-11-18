import {
  type ProvingRequestType,
  V2ProofInput,
  type V2ProofInputUri,
  V2ProofOutput,
  type V2ProofOutputUri,
  type V2ProvingJobId,
} from '@aztec/circuit-types';

/**
 * A database for storing proof inputs and outputs.
 */
export interface ProofInputOutputDatabase {
  /**
   * Save a proof input to the database.
   * @param jobId - The ID of the job the proof input is associated with.
   * @param type - The type of the proving request.
   * @param proofInput - The proof input to save.
   * @returns The URI of the saved proof input.
   */
  saveProofInput(jobId: V2ProvingJobId, type: ProvingRequestType, proofInput: V2ProofInput): Promise<V2ProofInputUri>;

  /**
   * Save a proof output to the database.
   * @param jobId - The ID of the job the proof input is associated with.
   * @param type - The type of the proving request.
   * @param proofOutput - The proof output to save.
   * @returns The URI of the saved proof output.
   */
  saveProofOutput(
    jobId: V2ProvingJobId,
    type: ProvingRequestType,
    proofOutput: V2ProofOutput,
  ): Promise<V2ProofOutputUri>;

  /**
   * Retrieve a proof input from the database.
   * @param uri - The URI of the proof input to retrieve.
   * @returns The proof input.
   */
  getProofInput(uri: V2ProofInputUri): Promise<V2ProofInput>;

  /**
   * Retrieve a proof output from the database.
   * @param uri - The URI of the proof output to retrieve.
   * @returns The proof output.
   */
  getProofOutput(uri: V2ProofOutputUri): Promise<V2ProofOutput>;
}

/**
 * An implementation of a proof input/output database that stores data inline in the URI.
 */
export class InlineProofIODatabase implements ProofInputOutputDatabase {
  private static readonly PREFIX = 'data:application/json;base64';
  private static readonly SEPARATOR = ',';
  private static readonly BUFFER_ENCODING = 'base64url';

  saveProofInput(_id: V2ProvingJobId, _type: ProvingRequestType, proofInput: V2ProofInput): Promise<V2ProofInputUri> {
    return Promise.resolve(
      (InlineProofIODatabase.PREFIX +
        InlineProofIODatabase.SEPARATOR +
        Buffer.from(JSON.stringify(proofInput)).toString(InlineProofIODatabase.BUFFER_ENCODING)) as V2ProofInputUri,
    );
  }

  saveProofOutput(
    _id: V2ProvingJobId,
    _type: ProvingRequestType,
    proofOutput: V2ProofOutput,
  ): Promise<V2ProofOutputUri> {
    return Promise.resolve(
      (InlineProofIODatabase.PREFIX +
        InlineProofIODatabase.SEPARATOR +
        Buffer.from(JSON.stringify(proofOutput)).toString(InlineProofIODatabase.BUFFER_ENCODING)) as V2ProofOutputUri,
    );
  }

  getProofInput(uri: V2ProofInputUri): Promise<V2ProofInput> {
    const [prefix, data] = uri.split(',');
    if (prefix !== InlineProofIODatabase.PREFIX) {
      throw new Error('Invalid proof input URI: ' + prefix);
    }

    return Promise.resolve(
      V2ProofInput.parse(JSON.parse(Buffer.from(data, InlineProofIODatabase.BUFFER_ENCODING).toString())),
    );
  }

  getProofOutput(uri: V2ProofOutputUri): Promise<V2ProofOutput> {
    const [prefix, data] = uri.split(',');
    if (prefix !== InlineProofIODatabase.PREFIX) {
      throw new Error('Invalid proof output URI: ' + prefix);
    }

    return Promise.resolve(
      V2ProofOutput.parse(JSON.parse(Buffer.from(data, InlineProofIODatabase.BUFFER_ENCODING).toString())),
    );
  }
}
