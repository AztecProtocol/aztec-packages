import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';

import { Vector } from '../types/shared.js';

export class Note extends Vector<Fr> {
  static get schema() {
    return schemas.Buffer.transform(Note.fromBuffer);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Note(reader.readVector(Fr));
  }

  /**
   * Generates a random Note instance with a variable number of items.
   * The number of items is determined by a random value between 1 and 10 (inclusive).
   * Each item in the Note is generated using the Fr.random() method.
   *
   * @returns A randomly generated Note instance.
   */
  static random() {
    const numItems = randomInt(10) + 1;
    const items = Array.from({ length: numItems }, () => Fr.random());
    return new Note(items);
  }
}
