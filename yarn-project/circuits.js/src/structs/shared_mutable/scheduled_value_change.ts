import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { SCHEDULED_DELAY_CHANGE_PCKD_LEN } from '../../constants.gen.js';

// TODO(Alvaro) make this generic in the length of previous & post so it can be used with other things that are not 1 field sized
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

  static computeSlot(sharedMutableSlot: Fr) {
    return sharedMutableSlot.add(new Fr(SCHEDULED_DELAY_CHANGE_PCKD_LEN));
  }

  static async readFromTree(sharedMutableSlot: Fr, reader: (storageSlot: Fr) => Promise<Fr>) {
    const baseValueSlot = this.computeSlot(sharedMutableSlot);
    const fields = [];
    for (let i = 0; i < 3; i++) {
      fields.push(await reader(baseValueSlot.add(new Fr(i))));
    }
    return ScheduledValueChange.fromFields(fields);
  }

  async writeToTree(sharedMutableSlot: Fr, writer: (storageSlot: Fr, value: Fr) => Promise<void>) {
    const baseValueSlot = ScheduledValueChange.computeSlot(sharedMutableSlot);
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
