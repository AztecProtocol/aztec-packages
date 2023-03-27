import { AztecRPCClient, TxHash, TxReceipt } from '@aztec/aztec-rpc';
import { retryUntil } from '../foundation.js';

export class SentTx {
  private receipt?: TxReceipt;

  constructor(private arc: AztecRPCClient, private txHashPromise: Promise<TxHash>) {}

  public async getTxHash() {
    return await this.txHashPromise;
  }

  public async getReceipt(timeout = 0, interval = 1) {
    if (this.receipt) {
      return this.receipt;
    }

    const txHash = await this.getTxHash();
    console.log('tx hash');
    this.receipt = await retryUntil(() => this.arc.getTxReceipt(txHash), 'getReceipt', timeout, interval);
    return this.receipt;
  }
}
