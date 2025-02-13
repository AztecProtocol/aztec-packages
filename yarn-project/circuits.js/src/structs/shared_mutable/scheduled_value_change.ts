import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { SCHEDULED_DELAY_CHANGE_PCKD_LEN } from '../../constants.gen.js';

export class ScheduledValueChange {
  constructor(public previous: Fr[], public post: Fr[], public blockOfChange: number) {
    if (this.previous.length !== this.post.length) {
      throw new Error('Previous and post must have the same length');
    }
  }

  static fromFields(fields: Fr[] | FieldReader, valueSize: number) {
    const reader = FieldReader.asReader(fields);
    return new this(reader.readFieldArray(valueSize), reader.readFieldArray(valueSize), reader.readField().toNumber());
  }

  toFields(): Fr[] {
    return [...this.previous, ...this.post, new Fr(this.blockOfChange)];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.toFields());
  }

  static fromBuffer(buffer: Buffer | BufferReader, valueSize: number): ScheduledValueChange {
    const reader = BufferReader.asReader(buffer);
    return ScheduledValueChange.fromFields(reader.readArray(3, Fr), valueSize);
  }

  static empty(valueSize: number) {
    return new this(Array(valueSize).fill(new Fr(0)), Array(valueSize).fill(new Fr(0)), 0);
  }

  isEmpty(): boolean {
    return this.previous.every(v => v.isZero()) && this.post.every(v => v.isZero()) && this.blockOfChange === 0;
  }

  static computeSlot(sharedMutableSlot: Fr) {
    return sharedMutableSlot.add(new Fr(SCHEDULED_DELAY_CHANGE_PCKD_LEN));
  }

  static async readFromTree(sharedMutableSlot: Fr, valueSize: number, reader: (storageSlot: Fr) => Promise<Fr>) {
    const baseValueSlot = this.computeSlot(sharedMutableSlot);
    const fields = [];
    for (let i = 0; i < 3; i++) {
      fields.push(await reader(baseValueSlot.add(new Fr(i))));
    }
    return ScheduledValueChange.fromFields(fields, valueSize);
  }

  async writeToTree(sharedMutableSlot: Fr, writer: (storageSlot: Fr, value: Fr) => Promise<void>) {
    const baseValueSlot = ScheduledValueChange.computeSlot(sharedMutableSlot);
    const fields = this.toFields();

    for (let i = 0; i < fields.length; i++) {
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
