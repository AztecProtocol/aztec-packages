import {
  type ProofUri,
  type ProvingJobId,
  type ProvingJobInputs,
  type ProvingJobInputsMap,
  type ProvingJobResult,
  type ProvingJobResultsMap,
  getProvingJobInputClassFor,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { Storage } from '@google-cloud/storage';
import { join } from 'path';

import type { ProofStore } from './proof_store.js';

const INPUTS_PATH = 'inputs';

// REFACTOR(#13067): Use the stdlib/file-store instead of referencing google-cloud-storage directly.
export class GoogleCloudStorageProofStore implements ProofStore {
  private readonly storage: Storage;

  constructor(
    private readonly bucketName: string,
    private readonly path: string,
  ) {
    this.storage = new Storage();
  }

  public async saveProofInput<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
  ): Promise<ProofUri> {
    const path = join(this.path, INPUTS_PATH, ProvingRequestType[type], id);
    const file = this.storage.bucket(this.bucketName).file(path);
    await file.save(inputs.toBuffer());
    return file.cloudStorageURI.toString() as ProofUri;
  }

  saveProofOutput<T extends ProvingRequestType>(
    _id: ProvingJobId,
    _type: T,
    _result: ProvingJobResultsMap[T],
  ): Promise<ProofUri> {
    throw new Error('Not implemented');
  }

  public async getProofInput(uri: ProofUri): Promise<ProvingJobInputs> {
    try {
      const url = new URL(uri);
      const bucket = this.storage.bucket(url.host);
      const path = url.pathname.replace(/^\/+/, '');
      const file = bucket.file(path);
      if (!(await file.exists())) {
        throw new Error(`File at ${uri} does not exist`);
      }

      const typeString = path.split('/').at(-2);
      const type = typeString ? ProvingRequestType[typeString as keyof typeof ProvingRequestType] : undefined;
      if (type === undefined) {
        throw new Error(`Unrecognized proof type ${type} in path ${path}`);
      }

      const contents = await file.download();
      const inputs = getProvingJobInputClassFor(type).fromBuffer(contents[0]);
      return { inputs, type } as ProvingJobInputs;
    } catch (err) {
      throw new Error(`Error getting proof input at ${uri}: ${err}`);
    }
  }

  getProofOutput(_uri: ProofUri): Promise<ProvingJobResult> {
    throw new Error('Not implemented');
  }
}
