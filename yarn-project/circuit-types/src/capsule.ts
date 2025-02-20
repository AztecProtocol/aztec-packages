import { AztecAddress, Vector } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

/**
 * Read-only data that is passed to the contract through an oracle during a transaction execution.
 */
export class Capsule {
  constructor(
    /** The address of the contract the capsule is for */
    public readonly contractAddress: AztecAddress,
    /** The storage slot of the capsule */
    public readonly storageSlot: Fr,
    /** Data passed to the contract  */
    public readonly data: Fr[],
  ) {}

  static get schema() {
    return hexSchemaFor(Capsule);
  }

  toJSON() {
    return this.toString();
  }

  toBuffer() {
    return serializeToBuffer(this.contractAddress, this.storageSlot, new Vector(this.data));
  }

  static fromBuffer(buffer: Buffer | BufferReader): Capsule {
    const reader = BufferReader.asReader(buffer);
    return new Capsule(AztecAddress.fromBuffer(reader), Fr.fromBuffer(reader), reader.readVector(Fr));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return Capsule.fromBuffer(hexToBuffer(str));
  }
}
