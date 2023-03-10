import { retryUntil } from '../retry/index.js';
import { EthereumRpc } from './ethereum_rpc.js';
import { TxHash } from './tx_hash.js';
import { TransactionReceipt } from './types/index.js';

export interface SendTx<TxReceipt = TransactionReceipt> {
  getTxHash(): Promise<TxHash>;
  getReceipt(numConfirmations?: number, timeout?: number, interval?: number): Promise<TxReceipt>;
}

export class SentTransaction implements SendTx {
  private receipt?: TransactionReceipt | null;

  constructor(protected eth: EthereumRpc, protected txHashPromise: Promise<TxHash>) {}

  public async getTxHash(): Promise<TxHash> {
    return await this.txHashPromise;
  }

  public async getReceipt(numConfirmations = 1, timeout = 0, interval = 10): Promise<TransactionReceipt> {
    if (this.receipt) {
      return this.receipt;
    }

    const txHash = await this.getTxHash();
    const receipt = await waitForTxReceipt(txHash, this.eth, numConfirmations, timeout, interval);
    return await this.handleReceipt(receipt);
  }

  protected handleReceipt(receipt: TransactionReceipt) {
    if (receipt.status === false) {
      throw new Error('Transaction has been reverted by the EVM.');
    }
    return Promise.resolve(receipt);
  }
}

export async function waitForTxReceipt(
  txHash: TxHash,
  eth: EthereumRpc,
  confirmations = 1,
  timeout = 0,
  interval = 10,
) {
  return await retryUntil(
    async () => {
      const blockNumber = await eth.blockNumber();
      const receipt = await eth.getTransactionReceipt(txHash);

      if (!receipt) {
        return;
      }

      if (receipt.status === false) {
        throw new Error('Transaction has been reverted by the EVM.');
      }

      if (blockNumber - receipt.blockNumber + 1 >= confirmations) {
        return receipt;
      }
    },
    'waitForTxReceipt',
    timeout,
    interval,
  );
}
