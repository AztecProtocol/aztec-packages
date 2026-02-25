import { randomBytes } from '@aztec/foundation/crypto/random';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ChonkProof } from '../proofs/chonk_proof.js';
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

  it('toBuffer round-trip produces byte-identical buffers', async () => {
    const tx = await mockTx();
    const buf1 = tx.toBuffer();
    const tx2 = Tx.fromBuffer(buf1);
    const buf2 = tx2.toBuffer();
    expect(buf1.equals(buf2)).toBe(true);
  });

  it('computeTxHash is identical with and without buffer cache', async () => {
    const tx = Tx.random();
    const hashWithoutCache = await Tx.computeTxHash(tx);
    const buf = tx.toBuffer();
    const txFromBuf = Tx.fromBuffer(buf);
    const hashWithCache = await Tx.computeTxHash(txFromBuf);
    expect(hashWithoutCache).toEqual(hashWithCache);
  });

  it('getSize uses cached buffer length', async () => {
    const tx = await mockTx();
    const buf = tx.toBuffer();
    const txFromBuf = Tx.fromBuffer(buf);
    expect(txFromBuf.getSize()).toBe(buf.length);
  });

  it('clone produces byte-identical buffer', async () => {
    const tx = await mockTx();
    const buf = tx.toBuffer();
    const txFromBuf = Tx.fromBuffer(buf);
    const cloned = Tx.clone(txFromBuf);
    expect(cloned.toBuffer().equals(buf)).toBe(true);
  });
});

describe('ChonkProof buffer caching', () => {
  it('round-trip produces byte-identical buffers', () => {
    const proof = ChonkProof.random();
    const buf1 = proof.toBuffer();
    const proof2 = ChonkProof.fromBuffer(buf1);
    const buf2 = proof2.toBuffer();
    expect(buf1.equals(buf2)).toBe(true);
  });
});

describe('PrivateKernelTailCircuitPublicInputs buffer caching', () => {
  it('round-trip produces byte-identical buffers', async () => {
    const tx = await mockTx();
    const data = tx.data;
    const buf1 = data.toBuffer();
    const data2 = PrivateKernelTailCircuitPublicInputs.fromBuffer(buf1);
    const buf2 = data2.toBuffer();
    expect(buf1.equals(buf2)).toBe(true);
  });
});

describe('hash caching', () => {
  it('PrivateToPublicKernelCircuitPublicInputs.hash returns same value on repeated calls', async () => {
    const tx = await mockTx();
    const publicInputs = tx.data.toPrivateToPublicKernelCircuitPublicInputs();
    const hash1 = await publicInputs.hash();
    const hash2 = await publicInputs.hash();
    expect(hash1).toEqual(hash2);
  });

  it('cached intermediate objects return consistent hashes', async () => {
    const tx = await mockTx();
    const pi1 = tx.data.toPrivateToPublicKernelCircuitPublicInputs();
    const pi2 = tx.data.toPrivateToPublicKernelCircuitPublicInputs();
    expect(pi1).toBe(pi2); // same reference due to caching
    const hash1 = await pi1.hash();
    const hash2 = await pi2.hash();
    expect(hash1).toEqual(hash2);
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

  it('converts empty TxArray to and from buffer', () => {
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

  it('throws when deserializing an empty buffer', () => {
    const invalidBuffer = Buffer.alloc(0);
    expect(() => TxArray.fromBuffer(invalidBuffer)).toThrow('Failed to deserialize TxArray from buffer');
  });
});
