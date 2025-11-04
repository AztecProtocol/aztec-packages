import { AztecAddress } from '@aztec/aztec.js/addresses';
import { TxHash, TxReceipt, TxStatus } from '@aztec/aztec.js/tx';
import type { Wallet } from '@aztec/aztec.js/wallet';

export type UserTx = {
  txHash?: TxHash;
  receipt?: TxReceipt;
  date?: number;
  status: 'error' | 'simulating' | 'proving' | 'sending' | TxStatus;
  name: string;
  error?: string;
  contractAddress: AztecAddress;
};

export async function queryTxReceipt(tx: UserTx, wallet: Wallet) {
  const txHash = await tx.txHash;
  const txReceipt = await wallet.getTxReceipt(txHash);
  return txReceipt;
}
