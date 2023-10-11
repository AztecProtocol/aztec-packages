import { Fr, GrumpkinPrivateKey } from '@aztec/circuits.js';
import { ABIParameterVisibility, FunctionAbi, FunctionType } from '@aztec/foundation/abi';
import { AuthWitness, FunctionCall, PXE, TxExecutionRequest } from '@aztec/types';

import { AccountInterface } from '../account/interface.js';
import { ContractFunctionInteraction } from '../index.js';
import { BaseWallet } from './base_wallet.js';

/**
 * A wallet implementation that forwards authentication requests to a provided account.
 */
export class AccountWallet extends BaseWallet {
  constructor(pxe: PXE, protected account: AccountInterface) {
    super(pxe);
  }

  createTxExecutionRequest(execs: FunctionCall[]): Promise<TxExecutionRequest> {
    return this.account.createTxExecutionRequest(execs);
  }

  async createAuthWitness(message: Fr | Buffer): Promise<AuthWitness> {
    message = Buffer.isBuffer(message) ? Fr.fromBuffer(message) : message;
    const witness = await this.account.createAuthWitness(message);
    await this.pxe.addAuthWitness(witness);
    return witness;
  }

  /**
   * Returns a function interaction to set a message hash as authorized in this account.
   * Public calls can then consume this authorization.
   * @param message - Message hash to authorize.
   * @param authorized - True to authorize, false to revoke authorization.
   * @returns - A function interaction.
   */
  public setPublicAuth(message: Fr | Buffer, authorized: boolean): ContractFunctionInteraction {
    const args = [message, authorized];
    return new ContractFunctionInteraction(this, this.getAddress(), this.getSetIsValidStorageAbi(), args);
  }

  /** Returns the complete address of the account that implements this wallet. */
  public getCompleteAddress() {
    return this.account.getCompleteAddress();
  }

  /** Returns the address of the account that implements this wallet. */
  public getAddress() {
    return this.getCompleteAddress().address;
  }

  private getSetIsValidStorageAbi(): FunctionAbi {
    return {
      name: 'set_is_valid_storage',
      functionType: 'open' as FunctionType,
      isInternal: true,
      parameters: [
        {
          name: 'message_hash',
          type: { kind: 'field' },
          visibility: 'private' as ABIParameterVisibility,
        },
        {
          name: 'value',
          type: { kind: 'boolean' },
          visibility: 'private' as ABIParameterVisibility,
        },
      ],
      returnTypes: [],
    };
  }
}

/**
 * Extends {@link AccountWallet} with the encryption private key. Not required for
 * implementing the wallet interface but useful for testing purposes or exporting
 * an account to another pxe.
 */
export class AccountWalletWithPrivateKey extends AccountWallet {
  constructor(pxe: PXE, account: AccountInterface, private encryptionPrivateKey: GrumpkinPrivateKey) {
    super(pxe, account);
  }

  /** Returns the encryption private key associated with this account. */
  public getEncryptionPrivateKey() {
    return this.encryptionPrivateKey;
  }
}
