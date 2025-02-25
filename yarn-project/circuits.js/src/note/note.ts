import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';

import { Payload } from '../logs/l1_payload/payload.js';

export class Note extends Payload {
  static override get schema() {
    return schemas.Buffer.transform(Note.fromBuffer);
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Note(reader.readVector(Fr));
  }
}
