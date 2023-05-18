import { numToInt32BE } from '@aztec/foundation/serialize';
import { Tx, TxHash } from '@aztec/types';

/**
 * Enumeration of P2P message types.
 */
export enum Messages {
  POOLED_TRANSACTIONS = 1,
  POOLED_TRANSACTION_HASHES = 2,
  GET_TRANSACTIONS = 3,
}

/**
 * Create a P2P message from the message type and message data.
 * @param type - The type of the message.
 * @param messageData - The binary message data.
 * @returns The encoded message.
 */
export function createMessage(type: Messages, messageData: Buffer) {
  return Buffer.concat([numToInt32BE(type), messageData]);
}

/**
 * Create a POOLED_TRANSACTIONS message from an array of transactions.
 * @param txs - The transactions to encoded into a message.
 * @returns The encoded message.
 */
export function createTransactionsMessage(txs: Tx[]) {
  const messageData = txs.map(x => Tx.toMessage(x));
  return createMessage(Messages.POOLED_TRANSACTIONS, Buffer.concat(messageData));
}

/**
 * Decode a POOLED_TRANSACTIONS message into the original transaction objects.
 * @param message - The binary message to be decoded.
 * @returns - The array of transactions originally encoded into the message.
 */
export function decodeTransactionsMessage(message: Buffer) {
  let offset = 0;
  const txs: Tx[] = [];
  while (offset < message.length) {
    const size = message.readUInt32BE(offset);
    txs.push(Tx.fromMessage(message.subarray(offset)));
    offset += size + 4;
  }
  return txs;
}

/**
 * Create a POOLED_TRANSACTION_HASHES message.
 * @param hashes - The transaction hashes to be sent.
 * @returns The encoded message.
 */
export function createTransactionHashesMessage(hashes: TxHash[]) {
  const messageData = hashes.map(x => x.buffer);
  return createMessage(Messages.POOLED_TRANSACTION_HASHES, Buffer.concat(messageData));
}

/**
 * Decode a POOLED_TRANSACTION_HASHESs message ito the original transaction hash objects.
 * @param message - The binary message to be decoded.
 * @returns - The array of transaction hashes originally encoded into the message.
 */
export function decodeTransactionHashesMessage(message: Buffer) {
  let offset = 0;
  const txHashes: TxHash[] = [];
  while (offset < message.length) {
    const slice = message.subarray(offset, offset + TxHash.SIZE);
    if (slice.length < TxHash.SIZE) {
      throw new Error(`Invalid message size when processing transaction hashes message`);
    }
    txHashes.push(new TxHash(slice));
    offset += TxHash.SIZE;
  }
  return txHashes;
}

/**
 * Create a GET_TRANSACTIONS message from an array of transaction hashes.
 * @param hashes - The hashes of the transactions to be requested.
 * @returns The encoded message.
 */
export function createGetTransactionsRequestMessage(hashes: TxHash[]) {
  const messageData = hashes.map(x => x.buffer);
  return createMessage(Messages.GET_TRANSACTIONS, Buffer.concat(messageData));
}

/**
 * Decode a GET_TRANSACTIONS message into the original transaction hash objects.
 * @param message - The binary message to be decoded.
 * @returns - The array of transaction hashes originally encoded into the message.
 */
export function decodeGetTransactionsRequestMessage(message: Buffer) {
  // for the time being this payload is effectively the same as the POOLED_TRANSACTION_HASHES message
  return decodeTransactionHashesMessage(message);
}
