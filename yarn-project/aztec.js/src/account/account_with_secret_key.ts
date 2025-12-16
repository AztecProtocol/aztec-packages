import type { Fr } from '@aztec/foundation/fields';
import { computeAddressSecret, deriveMasterIncomingViewingSecretKey } from '@aztec/stdlib/keys';

import { BaseAccount } from './account.js';
import type { Salt } from './index.js';
import type { AccountInterface } from './interface.js';

/**
 * Extends {@link Account} with the encryption private key. Not required for
 * implementing the wallet interface but useful for testing purposes or exporting
 * an account to another pxe.
 */
export class AccountWithSecretKey extends BaseAccount {
  constructor(
    account: AccountInterface,
    private secretKey: Fr,
    /** Deployment salt for this account contract. */
    public readonly salt: Salt,
  ) {
    super(account);
  }

  /** Returns the encryption private key associated with this account. */
  public getSecretKey() {
    return this.secretKey;
  }

  /** Returns the encryption secret, the secret of the encryption point—the point that others use to encrypt messages to this account
   * note - this ensures that the address secret always corresponds to an address point with y being positive
   * dev - this is also referred to as the address secret, which decrypts payloads encrypted to an address point
   */
  public async getEncryptionSecret() {
    return computeAddressSecret(
      await this.getCompleteAddress().getPreaddress(),
      deriveMasterIncomingViewingSecretKey(this.getSecretKey()),
    );
  }
}
