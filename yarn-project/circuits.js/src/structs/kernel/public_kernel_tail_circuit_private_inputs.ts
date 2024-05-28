import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import {
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_HINTS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '../../constants.gen.js';
import {
  type NullifierNonExistentReadRequestHints,
  nullifierNonExistentReadRequestHintsFromBuffer,
} from '../non_existent_read_request_hints.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { PublicDataHint } from '../public_data_hint.js';
import { PublicDataReadRequestHints } from '../public_data_read_request_hints.js';
import { PublicDataUpdateRequest } from '../public_data_update_request.js';
import { type NullifierReadRequestHints, nullifierReadRequestHintsFromBuffer } from '../read_request_hints/index.js';
import { PublicKernelData } from './public_kernel_data.js';

export class PublicKernelTailCombineHints {
  constructor(
    public readonly sortedNoteHashes: Tuple<Fr, typeof MAX_NEW_NOTE_HASHES_PER_TX>,
    public readonly sortedNoteHashesIndexes: Tuple<number, typeof MAX_NEW_NOTE_HASHES_PER_TX>,
    public readonly sortedPublicDataUpdateRequests: Tuple<
      PublicDataUpdateRequest,
      typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    >,
    public readonly sortedPublicDataUpdateRequestsIndexes: Tuple<number, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
  ) {}

  static getFields(fields: FieldsOf<PublicKernelTailCombineHints>) {
    return [
      fields.sortedNoteHashes,
      fields.sortedNoteHashesIndexes,
      fields.sortedPublicDataUpdateRequests,
      fields.sortedPublicDataUpdateRequestsIndexes,
    ] as const;
  }

  static from(fields: FieldsOf<PublicKernelTailCombineHints>): PublicKernelTailCombineHints {
    return new PublicKernelTailCombineHints(...PublicKernelTailCombineHints.getFields(fields));
  }

  toBuffer() {
    return serializeToBuffer(...PublicKernelTailCombineHints.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicKernelTailCombineHints(
      reader.readArray(MAX_NEW_NOTE_HASHES_PER_TX, Fr),
      reader.readNumbers(MAX_NEW_NOTE_HASHES_PER_TX),
      reader.readArray(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest),
      reader.readNumbers(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
    );
  }
}

export class PublicKernelTailCircuitPrivateInputs {
  constructor(
    /**
     * Kernels are recursive and this is the data from the previous kernel.
     */
    public readonly previousKernel: PublicKernelData,
    /**
     * Contains hints for the nullifier read requests to locate corresponding pending or settled nullifiers.
     */
    public readonly nullifierReadRequestHints: NullifierReadRequestHints<
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX
    >,
    /**
     * Contains hints for the nullifier non existent read requests.
     */
    public readonly nullifierNonExistentReadRequestHints: NullifierNonExistentReadRequestHints,
    public readonly publicDataHints: Tuple<PublicDataHint, typeof MAX_PUBLIC_DATA_HINTS>,
    public readonly publicDataReadRequestHints: PublicDataReadRequestHints,
    public readonly startState: PartialStateReference,
    public readonly combineHints: PublicKernelTailCombineHints,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.previousKernel,
      this.nullifierReadRequestHints,
      this.nullifierNonExistentReadRequestHints,
      this.publicDataHints,
      this.publicDataReadRequestHints,
      this.startState,
      this.combineHints,
    );
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    return PublicKernelTailCircuitPrivateInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicKernelTailCircuitPrivateInputs(
      reader.readObject(PublicKernelData),
      nullifierReadRequestHintsFromBuffer(
        reader,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      ),
      nullifierNonExistentReadRequestHintsFromBuffer(reader),
      reader.readArray(MAX_PUBLIC_DATA_HINTS, PublicDataHint),
      reader.readObject(PublicDataReadRequestHints),
      reader.readObject(PartialStateReference),
      reader.readObject(PublicKernelTailCombineHints),
    );
  }

  clone() {
    return PublicKernelTailCircuitPrivateInputs.fromBuffer(this.toBuffer());
  }
}
