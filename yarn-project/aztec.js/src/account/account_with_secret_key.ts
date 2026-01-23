import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { GasSettings } from '@aztec/stdlib/gas';
import { computeAddressSecret, deriveMasterIncomingViewingSecretKey } from '@aztec/stdlib/keys';
import type { ExecutionPayload, TxExecutionRequest } from '@aztec/stdlib/tx';

import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { Account, Salt } from './index.js';

/**
 * Extends {@link BaseAccount} with the encryption private key. Not required for
 * implementing the wallet interface but useful for testing purposes or exporting
 * an account to another pxe.
 */
export class AccountWithSecretKey implements Account {
  constructor(
    private account: Account,
    private secretKey: Fr,
    /** Deployment salt for this account contract. */
    public readonly salt: Salt,
  ) {}

  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    chainInfo: ChainInfo,
    options?: any,
  ): Promise<TxExecutionRequest> {
    return this.account.createTxExecutionRequest(exec, gasSettings, chainInfo, options);
  }

  wrapExecutionPayload(exec: ExecutionPayload, options?: any): Promise<ExecutionPayload> {
    return this.account.wrapExecutionPayload(exec, options);
  }
  createAuthWit(intent: IntentInnerHash | CallIntent, chainInfo: ChainInfo): Promise<AuthWitness> {
    return this.account.createAuthWit(intent, chainInfo);
  }
  getCompleteAddress(): CompleteAddress {
    return this.account.getCompleteAddress();
  }
  getAddress(): AztecAddress {
    return this.account.getAddress();
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
