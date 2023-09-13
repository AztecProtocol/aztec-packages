import { Fr } from '@aztec/circuits.js';
import { ABIParameterVisibility, FunctionAbiHeader, FunctionType } from '@aztec/foundation/abi';
import { AuthWitness, AztecRPC, FunctionCall, TxExecutionRequest } from '@aztec/types';

import { AccountInterface } from '../account/interface.js';
import { ContractFunctionInteraction } from '../index.js';
import { BaseWallet } from './base_wallet.js';

/**
 * A wallet implementation that forwards authentication requests to a provided account.
 */
export class AccountWallet extends BaseWallet {
  constructor(rpc: AztecRPC, protected account: AccountInterface) {
    super(rpc);
  }

  createTxExecutionRequest(execs: FunctionCall[]): Promise<TxExecutionRequest> {
    return this.account.createTxExecutionRequest(execs);
  }

  async createAuthWitness(message: Fr | Buffer): Promise<AuthWitness> {
    message = Buffer.isBuffer(message) ? Fr.fromBuffer(message) : message;
    const witness = await this.account.createAuthWitness(message);
    await this.rpc.addAuthWitness(witness);
    return witness;
  }

  /**
   * Returns a function interaction to set a message hash as authorised in this account.
   * Public calls can then consume this authorisation.
   * @param message - Message hash to authorise.
   * @param authorised - True to authorise, false to revoke authorisation.
   * @returns - A function interaction.
   */
  public setPublicAuth(message: Fr | Buffer, authorised: boolean): ContractFunctionInteraction {
    const args = [message, authorised];
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

  private getSetIsValidStorageAbi(): FunctionAbiHeader {
    return {
      name: 'set_is_valid_storage',
      functionType: 'secret' as FunctionType,
      isInternal: false,
      parameters: [
        {
          name: 'message_hash',
          type: { kind: 'field' },
          visibility: 'private' as ABIParameterVisibility,
        },
        {
          name: 'value',
          type: { kind: 'field' },
          visibility: 'private' as ABIParameterVisibility,
        },
      ],
      returnTypes: [],
    };
  }
}
