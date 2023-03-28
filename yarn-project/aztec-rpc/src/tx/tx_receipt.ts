import { AztecAddress } from '@aztec/circuits.js';
import { TxHash } from './tx_hash.js';

export interface TxReceipt {
  txHash: TxHash;
  // txIndex: number;
  blockHash: Buffer | undefined;
  blockNumber: number | undefined;
  from: AztecAddress;
  to?: AztecAddress;
  contractAddress?: AztecAddress;
  status: boolean;
  error: string;
}
