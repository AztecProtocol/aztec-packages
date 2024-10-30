import { type PXE } from '@aztec/circuit-types';
import { type Fr, computeAddressSecret, deriveMasterIncomingViewingSecretKey } from '@aztec/circuits.js';

import { type Salt } from '../account/index.js';
import { type AccountInterface } from '../account/interface.js';
import { AccountWallet } from './account_wallet.js';

/**
 * Extends {@link AccountWallet} with the encryption private key. Not required for
 * implementing the wallet interface but useful for testing purposes or exporting
 * an account to another pxe.
 */
export class AccountWalletWithSecretKey extends AccountWallet {
  constructor(
    pxe: PXE,
    account: AccountInterface,
    private secretKey: Fr,
    /** Deployment salt for this account contract. */
    public readonly salt: Salt,
  ) {
    super(pxe, account);
  }

  /** Returns the encryption private key associated with this account. */
  public getSecretKey() {
    return this.secretKey;
  }

  /** Returns the encryption secret, the secret of the encryption point—the point that others use to encrypt messages to this account
   * note - this ensures that the address secret always corresponds to an address point with y being positive
   * dev - this is also referred to as the address secret, which decrypts payloads encrypted to an address point
   */
  public getEncryptionSecret() {
    return computeAddressSecret(
      this.getCompleteAddress().getPreaddress(),
      deriveMasterIncomingViewingSecretKey(this.getSecretKey()),
    );
  }
}
