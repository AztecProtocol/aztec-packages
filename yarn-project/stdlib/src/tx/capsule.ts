import { Fr } from '@aztec/foundation/curves/bn254';
import { hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { AztecAddress } from '../aztec-address/index.js';
import { Vector } from '../types/shared.js';

/**
 * Read-only data that is passed to the contract through an oracle during a transaction execution.
 * TODO(#12425): Check whether this is always used to represent a transient capsule and if so, rename to
 * TransientCapsule.
 */
export class Capsule {
  constructor(
    /** The address of the contract the capsule is for */
    public readonly contractAddress: AztecAddress,
    /** The storage slot of the capsule */
    public readonly storageSlot: Fr,
    /** Data passed to the contract  */
    public readonly data: Fr[],
    /** Optional namespace for the capsule contents */
    public readonly scope?: AztecAddress,
  ) {}

  static get schema() {
    return hexSchemaFor(Capsule);
  }

  toJSON() {
    return this.toString();
  }

  toBuffer() {
    return this.scope
      ? serializeToBuffer(this.contractAddress, this.storageSlot, new Vector(this.data), true, this.scope)
      : serializeToBuffer(this.contractAddress, this.storageSlot, new Vector(this.data), false);
  }

  static fromBuffer(buffer: Buffer | BufferReader): Capsule {
    const reader = BufferReader.asReader(buffer);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const data = reader.readVector(Fr);
    const hasScope = reader.readBoolean();
    return new Capsule(contractAddress, storageSlot, data, hasScope ? AztecAddress.fromBuffer(reader) : undefined);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return Capsule.fromBuffer(hexToBuffer(str));
  }
}
