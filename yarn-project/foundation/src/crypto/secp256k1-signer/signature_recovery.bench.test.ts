import fs from 'node:fs/promises';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

import { Buffer32 } from '../../buffer/buffer32.js';
import type { Signature } from '../../eth-signature/eth_signature.js';
import { Secp256k1Signer } from './secp256k1_signer.js';
import { recoverAddress, recoverPublicKey } from './utils.js';

// Signature recovery (ecrecover) is the dominant cost of authenticating inbound gossip on a
// validator: every checkpoint attestation and block/checkpoint proposal signature is recovered.
// This benchmark tracks the per-signature recovery cost, which the native libsecp256k1 path drives.
const SIGNATURES = 200;
const WARMUP_ROUNDS = 2;
const MEASURED_ROUNDS = 20;

describe('secp256k1 signature recovery', () => {
  const digest = Buffer32.fromBuffer(Buffer.from('ab'.repeat(32), 'hex'));
  const signatures: Signature[] = [];

  let recoverPublicKeyHistogram: RecordableHistogram;
  let recoverAddressHistogram: RecordableHistogram;

  beforeAll(() => {
    recoverPublicKeyHistogram = createHistogram();
    recoverAddressHistogram = createHistogram();
    for (let i = 0; i < SIGNATURES; i++) {
      signatures.push(Secp256k1Signer.random().sign(digest));
    }
  });

  afterAll(async () => {
    if (!process.env.BENCH_OUTPUT) {
      return;
    }
    const data: { name: string; value: number; unit: string }[] = [];
    const record = (name: string, histogram: RecordableHistogram) => {
      data.push({ name: `${name}/avg`, value: histogram.mean / 1000, unit: 'us' });
      data.push({ name: `${name}/p50`, value: histogram.percentile(50) / 1000, unit: 'us' });
      data.push({ name: `${name}/p95`, value: histogram.percentile(95) / 1000, unit: 'us' });
    };
    record('Secp256k1/recoverPublicKey', recoverPublicKeyHistogram);
    record('Secp256k1/recoverAddress', recoverAddressHistogram);

    await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
    await fs.writeFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
  });

  const measure = (histogram: RecordableHistogram, op: (signature: Signature) => unknown) => {
    for (let round = 0; round < WARMUP_ROUNDS; round++) {
      for (const signature of signatures) {
        op(signature);
      }
    }
    for (let round = 0; round < MEASURED_ROUNDS; round++) {
      for (const signature of signatures) {
        const start = process.hrtime.bigint();
        op(signature);
        histogram.record(Math.max(1, Number(process.hrtime.bigint() - start)));
      }
    }
  };

  it('recovers public keys from signatures', () => {
    measure(recoverPublicKeyHistogram, signature => recoverPublicKey(digest, signature));
  });

  it('recovers addresses from signatures', () => {
    measure(recoverAddressHistogram, signature => recoverAddress(digest, signature));
  });
});
