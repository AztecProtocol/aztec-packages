import { numToInt32BE } from '@aztec/foundation/serialize';
import { Tx } from '@aztec/types';

export enum Messages {
  TRANSACTIONS = 1,
}

export function createMessage(type: Messages, messageData: Buffer) {
  return Buffer.concat([numToInt32BE(type), messageData]);
}

export function createTransactionsMessage(txs: Tx[]) {
  const messageData = txs.map(x => Tx.toMessage(x));
  return createMessage(Messages.TRANSACTIONS, Buffer.concat(messageData));
}

export function decodeTransactionsMessage(message: Buffer) {
  let offset = 0;
  const txs: Tx[] = [];
  while (offset < message.length) {
    const size = message.readUInt32BE(offset);
    offset += 4;
    txs.push(Tx.fromMessage(message.subarray(offset)));
    offset += size;
  }
  return txs;
}
