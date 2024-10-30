import { type PXE, type TxHash, type TxReceipt } from '@aztec/circuit-types';
import { type FieldsOf } from '@aztec/foundation/types';

import { type Wallet } from '../account/index.js';
import { DefaultWaitOpts, SentTx, type WaitOpts } from '../contract/sent_tx.js';
import { waitForAccountSynch } from '../utils/account.js';

/** Extends a transaction receipt with a wallet instance for the newly deployed contract. */
export type DeployAccountTxReceipt = FieldsOf<TxReceipt> & {
  /** Wallet that corresponds to the newly deployed account contract. */
  wallet: Wallet;
};

/**
 * A deployment transaction for an account contract sent to the network, extending SentTx with methods to get the resulting wallet.
 */
export class DeployAccountSentTx extends SentTx {
  constructor(pxe: PXE, txHashPromise: Promise<TxHash>, private getWalletPromise: Promise<Wallet>) {
    super(pxe, txHashPromise);
  }

  /**
   * Awaits for the tx to be mined and returns the contract instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The deployed contract instance.
   */
  public async getWallet(opts?: WaitOpts): Promise<Wallet> {
    const receipt = await this.wait(opts);
    return receipt.wallet;
  }

  /**
   * Awaits for the tx to be mined and returns the receipt along with a wallet instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The transaction receipt with the wallet for the deployed account contract.
   */
  public override async wait(opts: WaitOpts = DefaultWaitOpts): Promise<DeployAccountTxReceipt> {
    const receipt = await super.wait(opts);
    const wallet = await this.getWalletPromise;
    await waitForAccountSynch(this.pxe, wallet.getCompleteAddress(), opts);
    return { ...receipt, wallet };
  }
}
