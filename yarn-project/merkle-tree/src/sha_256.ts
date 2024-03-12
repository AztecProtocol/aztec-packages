import { sha256 } from '@aztec/foundation/crypto';
import { Hasher } from '@aztec/types/interfaces';

/**
 * A helper class encapsulating SHA256 hash functionality.
 * @deprecated Don't call SHA256 directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export class SHA256 implements Hasher {
  /*
   * @deprecated Don't call SHA256 directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hash(lhs: Uint8Array, rhs: Uint8Array): Buffer {
    return sha256(Buffer.concat([Buffer.from(lhs), Buffer.from(rhs)]));
  }

  /*
   * @deprecated Don't call SHA256 directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hashInputs(inputs: Buffer[]): Buffer {
    return sha256(Buffer.concat(inputs));
  }
}
