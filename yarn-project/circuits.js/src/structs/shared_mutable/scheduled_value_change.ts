import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { SHARED_MUTABLE_VALUE_CHANGE_SEPARATOR } from '../../constants.gen.js';

export class ScheduledValueChange {
  constructor(public previous: Fr, public post: Fr, public blockOfChange: number) {}

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(reader.readField(), reader.readField(), reader.readField().toNumber());
  }

  toFields(): Tuple<Fr, 3> {
    return [this.previous, this.post, new Fr(this.blockOfChange)];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.toFields());
  }

  static fromBuffer(buffer: Buffer | BufferReader): ScheduledValueChange {
    const reader = BufferReader.asReader(buffer);
    return ScheduledValueChange.fromFields(reader.readArray(3, Fr));
  }

  static empty() {
    return new this(Fr.ZERO, Fr.ZERO, 0);
  }

  isEmpty(): boolean {
    return this.previous.isZero() && this.blockOfChange === 0 && this.post.isZero();
  }

  static async computeSlot(sharedMutableSlot: Fr) {
    return await poseidon2HashWithSeparator([sharedMutableSlot], SHARED_MUTABLE_VALUE_CHANGE_SEPARATOR);
  }

  static async readFromTree(sharedMutableSlot: Fr, reader: (storageSlot: Fr) => Promise<Fr>) {
    const baseValueSlot = await this.computeSlot(sharedMutableSlot);
    const fields = [];
    for (let i = 0; i < 3; i++) {
      fields.push(await reader(baseValueSlot.add(new Fr(i))));
    }
    return ScheduledValueChange.fromFields(fields);
  }

  async writeToTree(sharedMutableSlot: Fr, writer: (storageSlot: Fr, value: Fr) => Promise<void>) {
    const baseValueSlot = await ScheduledValueChange.computeSlot(sharedMutableSlot);
    const fields = this.toFields();
    for (let i = 0; i < 3; i++) {
      await writer(baseValueSlot.add(new Fr(i)), fields[i]);
    }
  }

  getCurrentAt(blockNumber: number) {
    if (blockNumber < this.blockOfChange) {
      return this.previous;
    } else {
      return this.post;
    }
  }
}
