import { type Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS } from '../../constants.gen.js';
import { countAccumulatedItems } from '../../utils/index.js';
import { type PublicKernelCircuitPublicInputs } from './public_kernel_circuit_public_inputs.js';

export class PublicKernelAccumulatedArrayLengths {
  constructor(
    public readonly noteHashReadRequests: number,
    public readonly nullifierReadRequests: number,
    public readonly nullifierNonExistentReadRequests: number,
    public readonly l1ToL2MsgReadRequests: number,
    public readonly publicDataReads: number,
    public readonly noteHashes: number,
    public readonly nullifiers: number,
    public readonly l2ToL1Msgs: number,
    public readonly unencryptedLogsHashes: number,
    public readonly publicDataUpdateRequests: number,
  ) {}

  static new(pi: PublicKernelCircuitPublicInputs) {
    return new PublicKernelAccumulatedArrayLengths(
      countAccumulatedItems(pi.validationRequests.noteHashReadRequests),
      countAccumulatedItems(pi.validationRequests.nullifierReadRequests),
      countAccumulatedItems(pi.validationRequests.nullifierNonExistentReadRequests),
      countAccumulatedItems(pi.validationRequests.l1ToL2MsgReadRequests),
      countAccumulatedItems(pi.validationRequests.publicDataReads),
      countAccumulatedItems(pi.end.noteHashes) + countAccumulatedItems(pi.endNonRevertibleData.noteHashes),
      countAccumulatedItems(pi.end.nullifiers) + countAccumulatedItems(pi.endNonRevertibleData.nullifiers),
      countAccumulatedItems(pi.end.l2ToL1Msgs) + countAccumulatedItems(pi.endNonRevertibleData.l2ToL1Msgs),
      countAccumulatedItems(pi.end.unencryptedLogsHashes) +
        countAccumulatedItems(pi.endNonRevertibleData.unencryptedLogsHashes),
      countAccumulatedItems(pi.end.publicDataUpdateRequests) +
        countAccumulatedItems(pi.endNonRevertibleData.publicDataUpdateRequests),
    );
  }

  getSize() {
    return NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS;
  }

  toBuffer() {
    return serializeToBuffer(
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.nullifierNonExistentReadRequests,
      this.l1ToL2MsgReadRequests,
      this.publicDataReads,
      this.noteHashes,
      this.nullifiers,
      this.l2ToL1Msgs,
      this.unencryptedLogsHashes,
      this.publicDataUpdateRequests,
    );
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  isEmpty(): boolean {
    return (
      this.noteHashReadRequests == 0 &&
      this.nullifierReadRequests == 0 &&
      this.nullifierNonExistentReadRequests == 0 &&
      this.l1ToL2MsgReadRequests == 0 &&
      this.publicDataReads == 0 &&
      this.noteHashes == 0 &&
      this.nullifiers == 0 &&
      this.l2ToL1Msgs == 0 &&
      this.unencryptedLogsHashes == 0 &&
      this.publicDataUpdateRequests == 0
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
    );
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return this.fromBuffer(Buffer.from(str, 'hex'));
  }

  static empty() {
    return new this(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
