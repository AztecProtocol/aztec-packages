import { numToInt32BE } from '@aztec/foundation/serialize';
import { Tx } from '@aztec/types';

/**
 * Enumeration of P2P message types.
 */
export enum Messages {
  TRANSACTIONS = 1,
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
 * Create a transactions message from an array of transactions.
 * @param txs - The transactions to encoded into a message.
 * @returns The encoded message.
 */
export function createTransactionsMessage(txs: Tx[]) {
  const messageData = txs.map(x => Tx.toMessage(x));
  return createMessage(Messages.TRANSACTIONS, Buffer.concat(messageData));
}

/**
 * Decode a transactions message ito the underlying transaction data.
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
