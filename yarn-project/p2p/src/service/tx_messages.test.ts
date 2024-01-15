import { Tx, mockTx, randomTxHash } from '@aztec/circuit-types';

import { expect } from '@jest/globals';

import {
  Messages,
  createGetTransactionsRequestMessage,
  createTransactionHashesMessage,
  createTransactionsMessage,
  decodeGetTransactionsRequestMessage,
  decodeMessageType,
  decodeTransactionHashesMessage,
  decodeTransactionsMessage,
  fromTxMessage,
  getEncodedMessage,
  toTxMessage,
} from './tx_messages.js';

const verifyTx = (actual: Tx, expected: Tx) => {
  expect(actual.data!.toBuffer()).toEqual(expected.data?.toBuffer());
  expect(actual.proof!.toBuffer()).toEqual(expected.proof!.toBuffer());
  expect(actual.encryptedLogs!.toBuffer()).toEqual(expected.encryptedLogs?.toBuffer());
  expect(actual.newContracts!.length).toEqual(expected.newContracts!.length);
  for (let i = 0; i < actual.newContracts!.length; i++) {
    expect(actual.newContracts![i].toBuffer()).toEqual(expected.newContracts![i].toBuffer());
  }
};

describe('Messages', () => {
  it('Correctly serializes and deserializes a single private transaction', () => {
    const transaction = mockTx();
    const message = toTxMessage(transaction);
    const decodedTransaction = fromTxMessage(message);
    verifyTx(decodedTransaction, transaction);
  });

  it('Correctly serializes and deserializes transactions messages', () => {
    const privateTransactions = [mockTx(), mockTx(), mockTx()];
    const message = createTransactionsMessage(privateTransactions);
    expect(decodeMessageType(message)).toBe(Messages.POOLED_TRANSACTIONS);
    const decodedTransactions = decodeTransactionsMessage(getEncodedMessage(message));
    verifyTx(decodedTransactions[0], privateTransactions[0]);
    verifyTx(decodedTransactions[1], privateTransactions[1]);
    verifyTx(decodedTransactions[2], privateTransactions[2]);
  });

  it('Correctly serializes and deserializes transaction hashes message', () => {
    const txHashes = [randomTxHash(), randomTxHash(), randomTxHash()];
    const message = createTransactionHashesMessage(txHashes);
    expect(decodeMessageType(message)).toEqual(Messages.POOLED_TRANSACTION_HASHES);
    const decodedHashes = decodeTransactionHashesMessage(getEncodedMessage(message));
    expect(decodedHashes.map(x => x.toString())).toEqual(txHashes.map(x => x.toString()));
  });

  it('Correctly serializes and deserializes get transactions message', () => {
    const txHashes = [randomTxHash(), randomTxHash(), randomTxHash()];
    const message = createGetTransactionsRequestMessage(txHashes);
    expect(decodeMessageType(message)).toEqual(Messages.GET_TRANSACTIONS);
    const decodedHashes = decodeGetTransactionsRequestMessage(getEncodedMessage(message));
    expect(decodedHashes.map(x => x.toString())).toEqual(txHashes.map(x => x.toString()));
  });
});
