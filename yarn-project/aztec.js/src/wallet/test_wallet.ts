import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { Account } from '../account/account.js';
import type { AccountContract } from '../account/account_contract.js';
import { SignerlessAccount } from '../account/signerless_account.js';
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

  protected async getAccountFromAddress(address?: AztecAddress): Promise<Account> {
    let account: Account | undefined;
    if (!address) {
      const { l1ChainId: chainId, rollupVersion } = await this.pxe.getNodeInfo();
      account = new SignerlessAccount(new DefaultMultiCallEntrypoint(chainId, rollupVersion));
    } else {
      account = this.#accounts.get(address?.toString() ?? '');
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

  async createAccount(accountData: AccountData): Promise<AccountManager> {
    const accountManager = await AccountManager.create(
      this,
      this.pxe,
      accountData.secret,
      accountData.contract,
      accountData.salt,
    );

    this.#accounts.set(accountManager.getAddress().toString(), await accountManager.getAccount());

    return accountManager;
  }
}
