import { PartialAddress } from '@aztec/circuits.js';
import { PublicKey } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/circuits.js';

/**
 * A complete address is a combination of an Aztec address, a public key and a partial address.
 *
 * @remarks We have introduced this type because it is common that these 3 values are used together. They are commonly
 *          used together because it is the information needed to send user a note.
 * @remarks See the link bellow for details about how address is computed:
 *          https://github.com/AztecProtocol/aztec-packages/blob/master/docs/docs/concepts/foundation/accounts/keys.md#addresses-partial-addresses-and-public-keys
 */
export class CompleteAddress {
  constructor(
    /** Contract address (typically of an account contract) */
    public address: AztecAddress,
    /** Public key corresponding to the address (used during note encryption). */
    public publicKey: PublicKey,
    /** Partial key corresponding to the public key to the address. */
    public partialAddress: PartialAddress,
  ) {}
}
