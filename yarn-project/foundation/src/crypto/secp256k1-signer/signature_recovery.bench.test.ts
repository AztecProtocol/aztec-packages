import { secp256k1 } from '@noble/curves/secp256k1';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

import { Buffer32 } from '../../buffer/buffer32.js';
import { EthAddress } from '../../eth-address/index.js';
import type { Signature } from '../../eth-signature/eth_signature.js';
import { keccak256 } from '../keccak/index.js';
import { Secp256k1Signer } from './secp256k1_signer.js';
import { recoverAddress, recoverPublicKey, toRecoveryBit } from './utils.js';

// Signature recovery (ecrecover) is the dominant cost of authenticating inbound gossip on a
// validator: every checkpoint attestation and block/checkpoint proposal signature is recovered.
// The production path (`native`) uses native libsecp256k1 when available; the `noble` variant is the
// pure-JS `@noble/curves` fallback. Tracking both makes the speedup visible and catches a regression
// in either backend.
const SIGNATURES = 200;
const WARMUP_ROUNDS = 2;
const MEASURED_ROUNDS = 20;

/** Pure-JS `@noble/curves` recovery — mirrors the fallback branch of `recoverPublicKey`. */
function nobleRecoverPublicKey(hash: Buffer32, signature: Signature): Buffer {
  const { r, s, v } = signature;
  const sig = new secp256k1.Signature(r.toBigInt(), s.toBigInt()).addRecoveryBit(toRecoveryBit(v));
  return Buffer.from(sig.recoverPublicKey(hash.buffer).toHex(false), 'hex');
}

function publicKeyToAddress(publicKey: Buffer): EthAddress {
  return new EthAddress(keccak256(publicKey.subarray(1)).subarray(12));
}

describe('secp256k1 signature recovery', () => {
  const digest = Buffer32.fromBuffer(Buffer.from('ab'.repeat(32), 'hex'));
  const signatures: Signature[] = [];

  const histograms = {
    'recoverPublicKey/native': createHistogram(),
    'recoverPublicKey/noble': createHistogram(),
    'recoverAddress/native': createHistogram(),
    'recoverAddress/noble': createHistogram(),
  };

  beforeAll(() => {
    for (let i = 0; i < SIGNATURES; i++) {
      signatures.push(Secp256k1Signer.random().sign(digest));
    }
  });

  afterAll(async () => {
    if (!process.env.BENCH_OUTPUT) {
      return;
    }
    const data: { name: string; value: number; unit: string }[] = [];
    for (const [name, histogram] of Object.entries(histograms)) {
      data.push({ name: `Secp256k1/${name}/avg`, value: histogram.mean / 1000, unit: 'us' });
      data.push({ name: `Secp256k1/${name}/p50`, value: histogram.percentile(50) / 1000, unit: 'us' });
      data.push({ name: `Secp256k1/${name}/p95`, value: histogram.percentile(95) / 1000, unit: 'us' });
    }
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

  it('recovers public keys (native)', () => {
    measure(histograms['recoverPublicKey/native'], signature => recoverPublicKey(digest, signature));
  });

  it('recovers public keys (noble)', () => {
    measure(histograms['recoverPublicKey/noble'], signature => nobleRecoverPublicKey(digest, signature));
  });

  it('recovers addresses (native)', () => {
    measure(histograms['recoverAddress/native'], signature => recoverAddress(digest, signature));
  });

  it('recovers addresses (noble)', () => {
    measure(histograms['recoverAddress/noble'], signature =>
      publicKeyToAddress(nobleRecoverPublicKey(digest, signature)),
    );
  });
});
