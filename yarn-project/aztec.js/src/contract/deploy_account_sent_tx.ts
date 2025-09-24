import type { FieldsOf } from '@aztec/foundation/types';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { TxHash, TxReceipt } from '@aztec/stdlib/tx';

import type { Account } from '../account/account.js';
import type { Wallet } from '../wallet/wallet.js';
import { DefaultWaitOpts, SentTx, type WaitOpts } from './sent_tx.js';

/** Extends a transaction receipt with a wallet instance for the newly deployed contract. */
export type DeployAccountTxReceipt = FieldsOf<TxReceipt> & {
  /** Account that corresponds to the newly deployed account contract. */
  account: Account;
};

/**
 * A deployment transaction for an account contract sent to the network, extending SentTx with methods to get the resulting wallet.
 */
export class DeployAccountSentTx extends SentTx {
  constructor(
    walletOrNode: Wallet | AztecNode,
    sendTx: () => Promise<TxHash>,
    private getAccountPromise: Promise<Account>,
  ) {
    super(walletOrNode, sendTx);
  }

  /**
   * Awaits for the tx to be mined and returns the contract instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The deployed contract instance.
   */
  public async getAccount(opts?: WaitOpts): Promise<Account> {
    const receipt = await this.wait(opts);
    return receipt.account;
  }

  /**
   * Awaits for the tx to be mined and returns the receipt along with a wallet instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The transaction receipt with the wallet for the deployed account contract.
   */
  public override async wait(opts: WaitOpts = DefaultWaitOpts): Promise<DeployAccountTxReceipt> {
    const receipt = await super.wait(opts);
    const account = await this.getAccountPromise;
    return { ...receipt, account };
  }
}
