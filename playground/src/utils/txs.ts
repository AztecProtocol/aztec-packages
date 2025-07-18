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


export async function queryTxReceipt(tx: UserTx, node: AztecNode) {
  const txHash = await tx.txHash;
  const txReceipt = await node.getTxReceipt(txHash);
  return txReceipt;
}
