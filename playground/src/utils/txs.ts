import { TxHash, TxReceipt, TxStatus, AztecAddress, type Wallet } from '@aztec/aztec.js';

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
