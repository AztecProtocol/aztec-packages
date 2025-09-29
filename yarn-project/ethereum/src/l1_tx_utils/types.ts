import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemTransactionSignature } from '@aztec/foundation/eth-signature';

import type { Abi, Address, Hex, TransactionSerializable } from 'viem';

import type { L1TxUtilsConfig } from './config.js';

export interface L1TxRequest {
  to: Address | null;
  data?: Hex;
  value?: bigint;
  abi?: Abi;
}

export type L1TxConfig = Partial<L1TxUtilsConfig> & { gasLimit?: bigint; txTimeoutAt?: Date };

export interface L1BlobInputs {
  blobs: Uint8Array[];
  kzg: any;
  maxFeePerBlobGas?: bigint;
}

export interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerBlobGas?: bigint;
}

export type TransactionStats = {
  /** Address of the sender. */
  sender: string;
  /** Hash of the transaction. */
  transactionHash: string;
  /** Size in bytes of the tx calldata */
  calldataSize: number;
  /** Gas required to pay for the calldata inclusion (depends on size and number of zeros)  */
  calldataGas: number;
};

export enum TxUtilsState {
  /** The EOA is ready to send a tx */
  IDLE,
  /** A tx has been sent and we are waiting for it to be mined */
  TX_SENT,
  /** A tx took too long to be mined so it is being replaced with a sped-up tx */
  TX_SPEED_UP_SENT,
  /** A tx timed out so it a replacement noop tx was sent */
  TX_CANCEL_SENT,
  TX_TIMED_OUT,
  /** A tx was not mined and we have given up on it */
  TX_NOT_MINED,
  /** A tx has been mined and we are waiting for it to be finalized */
  TX_MINED,
}

export type SigningCallback = (
  transaction: TransactionSerializable,
  signingAddress: EthAddress,
) => Promise<ViemTransactionSignature>;

export type L1PendingTx = {
  request: L1TxRequest;
  attempts: number;
  nonce: number;
  gasPrice: GasPrice;
  txHash: Hex | undefined;
};

export class ReplacedL1TxError extends Error {
  constructor(
    message: string,
    public readonly nonce?: number,
  ) {
    super(message);
    this.name = 'ReplacedL1TxError';
  }
}
