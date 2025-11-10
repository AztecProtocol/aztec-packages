import { randomBytes } from '@aztec/foundation/crypto';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { mockTx } from '../tests/mocks.js';
import { Tx, TxArray } from './tx.js';

describe('Tx', () => {
  it('convert to and from buffer', async () => {
    const tx = await mockTx();
    const buf = tx.toBuffer();
    expect(Tx.fromBuffer(buf)).toEqual(tx);
  });

  it('convert to and from json', async () => {
    const tx = await mockTx();
    const json = jsonStringify(tx);
    expect(await Tx.schema.parseAsync(JSON.parse(json))).toEqual(tx);
  });
});

describe('TxArray', () => {
  it('converts to and from buffer', async () => {
    const tx1 = await mockTx();
    const tx2 = await mockTx();
    const txArray = new TxArray(tx1, tx2);
    expect(txArray.length).toBe(2);
    const buf = txArray.toBuffer();
    const deserializedTxArray = TxArray.fromBuffer(buf);
    expect(deserializedTxArray).toEqual(txArray);
    expect(deserializedTxArray).not.toBe(txArray);
  });

  it('convert empty TxArray to and from buffer', () => {
    const txArray = new TxArray();
    expect(txArray.length).toBe(0);
    const buf = txArray.toBuffer();
    const deserializedTxArray = TxArray.fromBuffer(buf);
    expect(deserializedTxArray).toEqual(txArray);
    expect(deserializedTxArray).not.toBe(txArray);
  });

  it('throws when deserializing invalid buffer', () => {
    const invalidBuffer = randomBytes(10);
    expect(() => TxArray.fromBuffer(invalidBuffer)).toThrow('Failed to deserialize TxArray from buffer');
  });
});
