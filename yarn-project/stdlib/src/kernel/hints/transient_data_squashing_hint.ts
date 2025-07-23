import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

export class TransientDataSquashingHint {
  constructor(
    public nullifierIndex: number,
    public noteHashIndex: number,
  ) {}

  toFields(): Fr[] {
    return [new Fr(this.nullifierIndex), new Fr(this.noteHashIndex)];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new TransientDataSquashingHint(reader.readU32(), reader.readU32());
  }

  isEmpty() {
    return !this.nullifierIndex && !this.noteHashIndex;
  }

  static empty() {
    return new TransientDataSquashingHint(0, 0);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.nullifierIndex, this.noteHashIndex);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new TransientDataSquashingHint(reader.readNumber(), reader.readNumber());
  }

  toString(): string {
    return `nullifierIndex=${this.nullifierIndex} noteHashIndex=${this.noteHashIndex}`;
  }

  [inspect.custom](): string {
    return `TransientDataSquashingHint { ${this.toString()} }`;
  }
}
