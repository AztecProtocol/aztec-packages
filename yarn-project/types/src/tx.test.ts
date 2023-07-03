import { KERNEL_PUBLIC_CALL_STACK_LENGTH, Proof } from '@aztec/circuits.js';
import { makeKernelPublicInputs, makePublicCallRequest } from '@aztec/circuits.js/factories';
import times from 'lodash.times';
import { EncodedContractFunction, TxL2Logs } from './index.js';
import { Tx } from './tx.js';

export const MockTx = () => {
  return Tx.createTx(
    makeKernelPublicInputs(),
    new Proof(Buffer.alloc(0)),
    TxL2Logs.random(8, 3), // 8 priv function invocations creating 3 encrypted logs each
    TxL2Logs.random(11, 2), // 8 priv + 3 pub function invocations creating 2 unencrypted logs each
    times(3, EncodedContractFunction.random),
    times(KERNEL_PUBLIC_CALL_STACK_LENGTH, makePublicCallRequest),
  );
};

describe('Tx', () => {
  it('convert to and from buffer', () => {
    const tx = MockTx();
    const buf = tx.toBuffer();
    expect(Tx.fromBuffer(buf)).toEqual(tx);
  });
});
