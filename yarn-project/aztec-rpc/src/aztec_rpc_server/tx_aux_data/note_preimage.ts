import { Fr } from '@aztec/foundation/fields';
import { Vector } from '@aztec/circuits.js';
import { BufferReader } from '@aztec/foundation/serialize';

export class NotePreImage extends Vector<Fr> {
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new NotePreImage(reader.readVector(Fr));
  }
}
