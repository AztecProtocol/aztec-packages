import { TxHash, TxReceipt, TxStatus, AztecAddress, type AztecNode, type PXE, type Wallet } from '@aztec/aztec.js';

export type UserTx = {
  txHash?: TxHash;
  receipt?: TxReceipt;
  date?: number;
  status: 'error' | 'simulating' | 'proving' | 'sending' | TxStatus;
  name: string;
  error?: string;
  contractAddress: AztecAddress;
};


export async function queryTxReceipt(tx: UserTx, pxe: PXE) {
  const txHash = await tx.txHash;
  const txReceipt = await pxe.getTxReceipt(txHash);
  return txReceipt;
}
