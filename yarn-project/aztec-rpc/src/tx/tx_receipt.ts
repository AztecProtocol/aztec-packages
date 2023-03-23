import { TxHash } from '../aztec_node.js';
import { AztecAddress } from '../circuits.js';

export interface TxReceipt {
  txHash: TxHash;
  // txIndex: number;
  blockHash: Buffer;
  blockNumber: number;
  from: AztecAddress;
  to?: AztecAddress;
  contractAddress?: AztecAddress;
  error?: string;
  status: boolean;
}
