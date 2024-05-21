import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { GeneratorIndex } from '../../constants.gen.js';
import { type KeyGenerator } from '../../keys/key_types.js';
import { GrumpkinPrivateKey } from '../../types/grumpkin_private_key.js';

export class KeyValidationHint {
  constructor(
    /** Master secret key used to derive sk_app and pk_m. */
    public skM: GrumpkinPrivateKey,
    /** Generator index used to generate sk_app. */
    public skAppGeneratorIndex: KeyGenerator,
    /** Index of the request in the array of hints. */
    public requestIndex: number,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new KeyValidationHint(
      reader.readObject(GrumpkinPrivateKey),
      reader.readObject(Fr).toNumber(),
      reader.readNumber(),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.skM, new Fr(this.skAppGeneratorIndex), this.requestIndex);
  }

  static empty() {
    return new KeyValidationHint(GrumpkinPrivateKey.zero(), GeneratorIndex.NSK_M, 0);
  }
}
