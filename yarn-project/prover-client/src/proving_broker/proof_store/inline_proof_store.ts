import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import {
  type ProofUri,
  type ProvingJobId,
  ProvingJobInputs,
  type ProvingJobInputsMap,
  ProvingJobResult,
  type ProvingJobResultsMap,
} from '@aztec/stdlib/interfaces/server';
import type { ProvingRequestType } from '@aztec/stdlib/proofs';
import type { ZodFor } from '@aztec/stdlib/schemas';

import type { ProofStore } from './proof_store.js';

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
