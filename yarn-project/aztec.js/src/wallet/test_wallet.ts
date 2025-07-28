import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { Account } from '../account/account.js';
import type { AccountContract } from '../account/account_contract.js';
import type { WaitOpts } from '../contract/sent_tx.js';
import { type WaitForProvenOpts, waitForProven } from '../contract/wait_for_proven.js';
import { FeeJuicePaymentMethod } from '../fee/fee_juice_payment_method.js';
import type { AztecNode } from '../utils/node.js';
import { AccountManager } from './account_manager.js';
import { BaseWallet } from './base_wallet.js';

/**
 * Data for generating an initial account.
 */
export interface AccountData {
  /**
   * Secret to derive the keys for the account.
   */
  secret: Fr;
  /**
   * Contract address salt.
   */
  salt: Fr;
  /**
   * Contract that backs the account.
   */
  contract: AccountContract;
}

export class TestWallet extends BaseWallet {
  #accounts: Map<string, Account> = new Map();

  protected getAccounFromAddress(address: AztecAddress): Promise<Account> {
    const account = this.#accounts.get(address.toString());
    if (!account) {
      throw new Error(`Account not found in wallet: ${address}`);
    }
    return Promise.resolve(account);
  }

  /**
   * Deploy schnorr account contract.
   * It will pay for the fee for the deployment itself. So it must be funded with the prefilled public data.
   */
  async createAccount(
    accountData: AccountData,
    opts: WaitOpts & {
      /**
       * Whether or not to skip publishing the contract class.
       */
      skipClassPublication?: boolean;
    } = { interval: 0.1 },
    waitForProvenOptions?: WaitForProvenOpts,
    node?: AztecNode,
  ): Promise<AccountManager> {
    const accountManager = await AccountManager.create(
      this,
      this.pxe,
      accountData.secret,
      accountData.contract,
      accountData.salt,
    );

    // Pay the fee by the account itself.
    // This only works when the world state is prefilled with the balance for the account in test environment.
    const paymentMethod = new FeeJuicePaymentMethod(accountManager.getAddress());

    const receipt = await accountManager
      .deploy({
        skipClassPublication: opts.skipClassPublication,
        skipInstancePublication: true,
        fee: { paymentMethod },
      })
      .wait(opts);

    this.#accounts.set(accountManager.getAddress().toString(), await accountManager.getAccount());

    if (waitForProvenOptions !== undefined) {
      if (!node) {
        throw new Error('Node must be provided to wait for the tx to be proven');
      }
      await waitForProven(node, receipt, waitForProvenOptions);
    }

    return accountManager;
  }
}
