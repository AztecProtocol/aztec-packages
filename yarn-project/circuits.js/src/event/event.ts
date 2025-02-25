import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { Payload } from '../logs/l1_payload/payload.js';
import { schemas } from '../schemas/schemas.js';

export class Event extends Payload {
  static override get schema() {
    return schemas.Buffer.transform(Event.fromBuffer);
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Event(reader.readVector(Fr));
  }
}
