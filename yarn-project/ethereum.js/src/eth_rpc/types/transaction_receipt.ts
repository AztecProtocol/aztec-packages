import { EthAddress } from '../../eth_address/index.js';
import { fromRawLogResponse, LogResponse, RawLogResponse, toRawLogResponse } from './log_response.js';
import { numberToHex } from '../../hex_string/index.js';
import { TxHash } from '../tx_hash.js';

export interface RawTransactionReceipt {
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to?: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  contractAddress?: string;
  logs?: RawLogResponse[];
  status?: string;
}

export interface EventLog<ReturnValues, Name = string> {
  id: string | null;
  removed?: boolean;
  event: Name;
  address: EthAddress;
  returnValues: ReturnValues;
  logIndex: number | null;
  transactionIndex: number | null;
  transactionHash: TxHash | null;
  blockHash: string | null;
  blockNumber: number | null;
  raw: { data: string; topics: string[] };
  signature: string | null;
}

export interface TransactionReceipt<Events = void> {
  transactionHash: TxHash;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: EthAddress;
  to?: EthAddress;
  cumulativeGasUsed: number;
  gasUsed: number;
  contractAddress?: EthAddress;
  logs?: LogResponse[];
  anonymousLogs?: LogResponse[];
  events?: Events extends void ? { [eventName: string]: EventLog<any>[] } : Events;
  status?: boolean;
}

export function fromRawTransactionReceipt(receipt?: RawTransactionReceipt): TransactionReceipt | null {
  if (!receipt || !receipt.blockHash) {
    return null;
  }

  return {
    ...receipt,
    to: receipt.to ? EthAddress.fromString(receipt.to) : undefined,
    from: EthAddress.fromString(receipt.from),
    blockNumber: Number(receipt.blockNumber),
    transactionIndex: Number(receipt.transactionIndex),
    transactionHash: TxHash.fromString(receipt.transactionHash),
    cumulativeGasUsed: Number(receipt.cumulativeGasUsed),
    gasUsed: Number(receipt.gasUsed),
    logs: receipt.logs ? receipt.logs.map(fromRawLogResponse) : undefined,
    contractAddress: receipt.contractAddress ? EthAddress.fromString(receipt.contractAddress) : undefined,
    status: receipt.status ? Boolean(Number(receipt.status)) : undefined,
  };
}

export function toRawTransactionReceipt(receipt: TransactionReceipt): RawTransactionReceipt {
  return {
    ...receipt,
    to: receipt.to ? receipt.to.toString() : undefined,
    from: receipt.from.toString(),
    blockNumber: numberToHex(receipt.blockNumber),
    transactionIndex: numberToHex(receipt.transactionIndex),
    transactionHash: receipt.transactionHash.toString(),
    cumulativeGasUsed: numberToHex(receipt.cumulativeGasUsed),
    gasUsed: numberToHex(receipt.gasUsed)!,
    logs: receipt.logs ? receipt.logs.map(toRawLogResponse) : undefined,
    contractAddress: receipt.contractAddress ? receipt.contractAddress.toString() : undefined,
    status: receipt.status !== undefined ? numberToHex(receipt.status ? 1 : 0) : undefined,
  };
}
