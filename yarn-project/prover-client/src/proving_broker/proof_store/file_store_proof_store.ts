import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import type { FileStore } from '@aztec/stdlib/file-store';
import {
  type ProofUri,
  type ProvingJobId,
  type ProvingJobInputs,
  type ProvingJobInputsMap,
  ProvingJobResult,
  type ProvingJobResultsMap,
  getProvingJobInputClassFor,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import type { ProofStore } from './proof_store.js';

const INPUTS_PATH = 'inputs';
const OUTPUTS_PATH = 'outputs';

/**
 * A proof store implementation backed by a generic FileStore.
 * Supports any storage backend (GCS, S3, local filesystem) via the FileStore abstraction.
 */
export class FileStoreProofStore implements ProofStore {
  constructor(private readonly fileStore: FileStore) {}

  async saveProofInput<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
  ): Promise<ProofUri> {
    const path = `${INPUTS_PATH}/${ProvingRequestType[type]}/${id}`;
    const uri = await this.fileStore.save(path, inputs.toBuffer());
    return uri as ProofUri;
  }

  async saveProofOutput<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    result: ProvingJobResultsMap[T],
  ): Promise<ProofUri> {
    const jobResult = { type, result } as ProvingJobResult;
    const json = jsonStringify(jobResult);
    const path = `${OUTPUTS_PATH}/${ProvingRequestType[type]}/${id}.json`;
    const uri = await this.fileStore.save(path, Buffer.from(json, 'utf-8'));
    return uri as ProofUri;
  }

  async getProofInput(uri: ProofUri): Promise<ProvingJobInputs> {
    try {
      const buffer = await this.fileStore.read(uri);
      const type = this.extractTypeFromUri(uri);
      const inputs = getProvingJobInputClassFor(type).fromBuffer(buffer);
      return { inputs, type } as ProvingJobInputs;
    } catch (err) {
      throw new Error(`Error getting proof input at ${uri}: ${err}`);
    }
  }

  async getProofOutput(uri: ProofUri): Promise<ProvingJobResult> {
    try {
      const buffer = await this.fileStore.read(uri);
      return jsonParseWithSchema(buffer.toString('utf-8'), ProvingJobResult);
    } catch (err) {
      throw new Error(`Error getting proof output at ${uri}: ${err}`);
    }
  }

  private extractTypeFromUri(uri: string): ProvingRequestType {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const typeString = pathParts.at(-2);
    const type = typeString ? ProvingRequestType[typeString as keyof typeof ProvingRequestType] : undefined;
    if (type === undefined) {
      throw new Error(`Unrecognized proof type ${typeString} in URI ${uri}`);
    }
    return type;
  }
}
