import { UInt8Vector } from '@aztec/circuits.js';
import { makeKernelPublicInputs, makeSignedTxRequest } from '@aztec/circuits.js/factories';
import { EncodedContractFunction, Tx, TxHash, UnverifiedData } from '@aztec/types';
import { expect } from '@jest/globals';
import { randomBytes } from 'crypto';
import {
  Messages,
  createGetTransactionsRequestMessage,
  createTransactionHashesMessage,
  createTransactionsMessage,
  decodeGetTransactionsRequestMessage,
  decodeMessageType,
  decodeTransactionHashesMessage,
  decodeTransactionsMessage,
  getEncodedMessage,
} from './messages.js';

const makePrivateTx = () => {
  const publicFunctions = [EncodedContractFunction.random(), EncodedContractFunction.random()];
  return Tx.createPrivate(
    makeKernelPublicInputs(),
    new UInt8Vector(Buffer.alloc(10, 9)),
    UnverifiedData.random(8),
    publicFunctions,
  );
};

const makePublicTx = () => {
  return Tx.createPublic(makeSignedTxRequest());
};

const makePublicPrivateTx = () => {
  return Tx.createPrivatePublic(
    makeKernelPublicInputs(),
    new UInt8Vector(randomBytes(512)),
    UnverifiedData.random(8),
    makeSignedTxRequest(),
  );
};

const makeTxHash = () => {
  return new TxHash(randomBytes(32));
};

const verifyPrivateTx = (actual: Tx, expected: Tx) => {
  expect(actual.data!.toBuffer()).toEqual(expected.data?.toBuffer());
  expect(actual.proof!.toBuffer()).toEqual(expected.proof!.toBuffer());
  expect(actual.unverifiedData!.toBuffer()).toEqual(expected.unverifiedData?.toBuffer());
  expect(actual.newContractPublicFunctions!.length).toEqual(expected.newContractPublicFunctions!.length);
  for (let i = 0; i < actual.newContractPublicFunctions!.length; i++) {
    expect(actual.newContractPublicFunctions![i].toBuffer()).toEqual(
      expected.newContractPublicFunctions![i].toBuffer(),
    );
  }
  expect(actual.txRequest).toBeUndefined();
};

const verifyPublicTx = (actual: Tx, expected: Tx) => {
  expect(actual.data).toBeUndefined();
  expect(actual.newContractPublicFunctions).toBeUndefined();
  expect(actual.proof).toBeUndefined();
  expect(actual.unverifiedData).toBeUndefined();
  expect(actual.txRequest!.toBuffer()).toEqual(expected.txRequest!.toBuffer());
};

const verifyPublicPrivateTx = (actual: Tx, expected: Tx) => {
  expect(actual.data!.toBuffer()).toEqual(expected.data?.toBuffer());
  expect(actual.proof).toEqual(expected.proof);
  expect(actual.unverifiedData!.toBuffer()).toEqual(expected.unverifiedData?.toBuffer());
  expect(actual.txRequest!.toBuffer()).toEqual(expected.txRequest!.toBuffer());
  expect(actual.newContractPublicFunctions).toBeUndefined();
};

describe('Messages', () => {
  it('Correctly serialises and deserialises a single private transaction', () => {
    const transaction = makePrivateTx();
    const message = Tx.toMessage(transaction);
    const decodedTransaction = Tx.fromMessage(message);
    verifyPrivateTx(decodedTransaction, transaction);
  });

  it('Correctly serialises and deserialises a single public transaction', () => {
    const transaction = makePublicTx();
    const message = Tx.toMessage(transaction);
    const decodedTransaction = Tx.fromMessage(message);
    verifyPublicTx(decodedTransaction, transaction);
  });

  it('Correctly serialises and deserialises a single private/public transaction', () => {
    const transaction = makePublicPrivateTx();
    const message = Tx.toMessage(transaction);
    const decodedTransaction = Tx.fromMessage(message);
    verifyPublicPrivateTx(decodedTransaction, transaction);
  });

  it('Correctly serialises and deserialises transactions messages', () => {
    const privateTransaction = makePrivateTx();
    const publicTransaction = makePublicTx();
    const publicPrivateTransaction = makePublicPrivateTx();
    const message = createTransactionsMessage([privateTransaction, publicTransaction, publicPrivateTransaction]);
    expect(decodeMessageType(message)).toBe(Messages.POOLED_TRANSACTIONS);
    const decodedTransactions = decodeTransactionsMessage(getEncodedMessage(message));
    verifyPrivateTx(decodedTransactions[0], privateTransaction);
    verifyPublicTx(decodedTransactions[1], publicTransaction);
    verifyPublicPrivateTx(decodedTransactions[2], publicPrivateTransaction);
  });

  it('Correctly serialises and deserialises transaction hashes message', () => {
    const txHashes = [makeTxHash(), makeTxHash(), makeTxHash()];
    const message = createTransactionHashesMessage(txHashes);
    expect(decodeMessageType(message)).toEqual(Messages.POOLED_TRANSACTION_HASHES);
    const decodedHashes = decodeTransactionHashesMessage(getEncodedMessage(message));
    expect(decodedHashes.map(x => x.toString())).toEqual(txHashes.map(x => x.toString()));
  });

  it('Correctly serialises and deserialises get transactions message', () => {
    const txHashes = [makeTxHash(), makeTxHash(), makeTxHash()];
    const message = createGetTransactionsRequestMessage(txHashes);
    expect(decodeMessageType(message)).toEqual(Messages.GET_TRANSACTIONS);
    const decodedHashes = decodeGetTransactionsRequestMessage(getEncodedMessage(message));
    expect(decodedHashes.map(x => x.toString())).toEqual(txHashes.map(x => x.toString()));
  });
});
