import { UInt8Vector } from '@aztec/circuits.js';
import { makeKernelPublicInputs, makeSignedTxRequest } from '@aztec/circuits.js/factories';
import { EncodedContractFunction, Tx, UnverifiedData } from '@aztec/types';
import { expect } from '@jest/globals';
import { randomBytes } from 'crypto';
import { Messages, createTransactionsMessage, decodeTransactionsMessage } from './messages.js';

const makePrivateTx = () => {
  const publicFunctions = [EncodedContractFunction.random(), EncodedContractFunction.random()];
  return Tx.createPrivate(
    makeKernelPublicInputs(),
    new UInt8Vector(randomBytes(512)),
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

const verifyPrivateTx = (actual: Tx, expected: Tx) => {
  expect(actual.data!.toBuffer()).toEqual(expected.data?.toBuffer());
  expect(actual.proof).toEqual(expected.proof);
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
  it('Correctly serialises and deserialises transactions messages', () => {
    const privateTransaction = makePrivateTx();
    const publicTransaction = makePublicTx();
    const publicPrivateTransaction = makePublicPrivateTx();

    const message = createTransactionsMessage([privateTransaction, publicTransaction, publicPrivateTransaction]);
    expect(message.readUInt32BE()).toBe(Messages.POOLED_TRANSACTIONS);
    const decodedTransactions = decodeTransactionsMessage(message.subarray(4));
    verifyPrivateTx(decodedTransactions[0], privateTransaction);
    verifyPublicTx(decodedTransactions[1], publicTransaction);
    verifyPublicPrivateTx(decodedTransactions[2], publicPrivateTransaction);
  });
});
