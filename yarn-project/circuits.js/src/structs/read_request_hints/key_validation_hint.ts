import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { Fr } from '@aztec/foundation/fields';
import { GrumpkinPrivateKey } from '../../types/grumpkin_private_key.js';

export class KeyValidationHint {
  constructor(
    /** Master secret key used to derive sk_app and pk_m. */
    public skM: GrumpkinPrivateKey,
    /** Generator index used to generate sk_app. */
    public skAppGeneratorIndex: Fr, // TODO(benesjan): Use KeyGeneratorIndex here
    /** Index of the request in the array of hints. */
    public requestIndex: number) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new KeyValidationHint(reader.readObject(GrumpkinPrivateKey), reader.readObject(Fr), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(this.skM, this.requestIndex);
  }

  static empty() {
    return new KeyValidationHint(GrumpkinPrivateKey.zero(), Fr.ZERO, 0);
  }
}
