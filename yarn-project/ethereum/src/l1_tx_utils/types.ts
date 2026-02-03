import type { BlobKzgInstance } from '@aztec/blob-lib/types';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemTransactionSignature } from '@aztec/foundation/eth-signature';

import type { Abi, Address, Hex, TransactionReceipt, TransactionSerializable } from 'viem';

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
  kzg: BlobKzgInstance;
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

export const TerminalTxUtilsState = [TxUtilsState.IDLE, TxUtilsState.MINED, TxUtilsState.NOT_MINED];

export type L1TxState = {
  id: number;
  txHashes: Hex[];
  cancelTxHashes: Hex[];
  gasLimit: bigint;
  gasPrice: GasPrice;
  txConfigOverrides: L1TxConfig;
  request: L1TxRequest;
  status: TxUtilsState;
  nonce: number;
  sentAtL1Ts: Date;
  lastSentAtL1Ts: Date;
  receipt?: TransactionReceipt;
  blobInputs: L1BlobInputs | undefined;
};

export type SigningCallback = (
  transaction: TransactionSerializable,
  signingAddress: EthAddress,
) => Promise<ViemTransactionSignature>;

export class UnknownMinedTxError extends Error {
  constructor(nonce: number, account: string) {
    super(`Nonce ${nonce} from account ${account} is MINED but not by one of our expected transactions`);
    this.name = 'UnknownMinedTxError';
  }
}

export class DroppedTransactionError extends Error {
  constructor(nonce: number, account: string) {
    super(`Transaction with nonce ${nonce} from account ${account} was dropped from the mempool`);
    this.name = 'DroppedTransactionError';
  }
}
