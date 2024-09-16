import { type Buffer32 } from '@aztec/foundation/buffer';
import { type Signature } from '@aztec/foundation/eth-signature';

/** Key Store
 *
 * A keystore interface that can be replaced with a local keystore / remote signer service
 */
export interface ValidatorKeyStore {
  sign(message: Buffer32): Promise<Signature>;
}
