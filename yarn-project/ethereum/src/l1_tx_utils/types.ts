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

export type L1GasConfig = Partial<L1TxUtilsConfig> & { gasLimit?: bigint; txTimeoutAt?: Date };

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
  IDLE,
  SENT,
  SPEED_UP,
  CANCELLED,
  NOT_MINED,
  MINED,
}

export type SigningCallback = (
  transaction: TransactionSerializable,
  signingAddress: EthAddress,
) => Promise<ViemTransactionSignature>;
