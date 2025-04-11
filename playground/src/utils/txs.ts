import { TxHash, TxReceipt, TxStatus, AztecAddress } from '@aztec/aztec.js';

export type UserTx = {
  txHash?: TxHash;
  receipt?: TxReceipt;
  date?: number;
  status: 'error' | 'simulating' | 'proving' | 'sending' | TxStatus;
  name: string;
  error?: string;
  contractAddress: AztecAddress;
};
