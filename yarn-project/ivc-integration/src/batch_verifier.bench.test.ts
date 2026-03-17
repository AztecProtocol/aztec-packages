/**
 * Batch chonk verifier benchmarks.
 *
 * Measures throughput of the batch verifier service at various batch sizes and core counts,
 * using proofs generated from the testing IVC stack (no external inputs needed).
 */
import { AztecClientBackend, BackendType, Barretenberg } from '@aztec/bb.js';
import { FifoFrameReader } from '@aztec/foundation/fifo';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { Unpackr } from 'msgpackr';
import { execFileSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { join } from 'node:path';

import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:bench:batch-verifier');

jest.setTimeout(600_000);

/** Result from the FIFO, matching the C++ VerifyResult struct. */
interface FifoVerifyResult {
  request_id: number;
  status: number;
  error_message: string;
  time_in_queue_ms: number;
  time_in_verify_ms: number;
  batch_failure_count: number;
}

/** Read N length-delimited msgpack frames from a FIFO. */
function readFifoResults(fifoPath: string, count: number): Promise<FifoVerifyResult[]> {
  return new Promise((resolve, reject) => {
    const unpackr = new Unpackr({ useRecords: false });
    const reader = new FifoFrameReader();
    const results: FifoVerifyResult[] = [];

    reader.on('frame', (payload: Buffer) => {
      results.push(unpackr.unpack(payload) as FifoVerifyResult);
      if (results.length >= count) {
        reader.stop();
        resolve(results);
      }
    });

    reader.on('error', err => {
      if (results.length < count) {
        reject(err);
      }
    });

    reader.on('end', () => {
      if (results.length >= count) {
        resolve(results);
      } else {
        reject(new Error(`FIFO ended after ${results.length}/${count} results`));
      }
    });

    reader.start(fifoPath);
  });
}

function createFifo(label: string): { fifoPath: string; cleanup: () => void } {
  const fifoPath = join(tmpdir(), `bb-bench-${label}-${process.pid}-${Date.now()}.fifo`);
  execFileSync('mkfifo', [fifoPath]);
  return {
    fifoPath,
    cleanup: () => {
      try {
        unlinkSync(fifoPath);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Corrupt flat proof fields by flipping bytes in an early field element. */
function corruptProofFields(fields: Uint8Array[]): Uint8Array[] {
  const corrupted = fields.map(f => Uint8Array.from(f));
  corrupted[2] = Uint8Array.from(corrupted[2]);
  corrupted[2][0] ^= 0xff;
  corrupted[2][1] ^= 0xff;
  return corrupted;
}

/** Run the batch verifier with the given workload and collect all results. */
async function runBatchVerifier(
  bb: Barretenberg,
  opts: {
    vks: Uint8Array[];
    numCores: number;
    batchSize: number;
    proofs: { vkIndex: number; proofFields: Uint8Array[] }[];
  },
): Promise<FifoVerifyResult[]> {
  const { fifoPath, cleanup } = createFifo(`${opts.numCores}c-${opts.proofs.length}p-bs${opts.batchSize}`);
  try {
    await bb.chonkBatchVerifierStart({
      vks: opts.vks,
      numCores: opts.numCores,
      batchSize: opts.batchSize,
      fifoPath,
    });

    const resultPromise = readFifoResults(fifoPath, opts.proofs.length);

    for (let i = 0; i < opts.proofs.length; i++) {
      await bb.chonkBatchVerifierQueue({
        requestId: i,
        vkIndex: opts.proofs[i].vkIndex,
        proofFields: opts.proofs[i].proofFields,
      });
    }

    await bb.chonkBatchVerifierStop({});
    return await resultPromise;
  } finally {
    cleanup();
  }
}

type BenchEntry = { name: string; value: number; unit: string };

describe('Batch Chonk Verifier Benchmarks', () => {
  let bb: Barretenberg;
  let validProofFields: Uint8Array[];
  let invalidProofFields: Uint8Array[];
  let vk: Uint8Array;
  const benchResults: BenchEntry[] = [];

  beforeAll(async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket });
    await bb.initSRSChonk();

    logger.info('Generating proof for benchmarks...');
    const [bytecodes, witnesses, , vks] = await generateTestingIVCStack(1, 0);
    const backend = new AztecClientBackend(bytecodes, bb);
    const [proofFields, , generatedVk] = await backend.prove(witnesses, vks);
    validProofFields = proofFields;
    invalidProofFields = corruptProofFields(validProofFields);
    vk = generatedVk;
    logger.info('Proof generated');
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      mkdirSync(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      writeFileSync(process.env.BENCH_OUTPUT, JSON.stringify(benchResults, null, 2));
    } else {
      logger.info('Benchmark results:');
      for (const r of benchResults) {
        logger.info(`  ${r.name}: ${r.value.toFixed(1)} ${r.unit}`);
      }
    }
    await bb.destroy();
  });

  for (const numCores of [4, 8, 16]) {
    it(`throughput: 16 proofs, batch_size=8, ${numCores} cores`, async () => {
      const numProofs = 16;
      const batchSize = 8;
      const proofs = Array.from({ length: numProofs }, () => ({ vkIndex: 0, proofFields: validProofFields }));

      const wallStart = performance.now();
      const results = await runBatchVerifier(bb, { vks: [vk], numCores, batchSize, proofs });
      const wallMs = performance.now() - wallStart;

      expect(results).toHaveLength(numProofs);
      expect(results.every(r => r.status === 0)).toBe(true);

      const avgVerifyMs = results.reduce((sum, r) => sum + r.time_in_verify_ms, 0) / results.length;
      const throughput = (numProofs / wallMs) * 1000;

      benchResults.push(
        { name: `BatchVerify/16_proofs/${numCores}_cores/wall_time`, value: wallMs, unit: 'ms' },
        { name: `BatchVerify/16_proofs/${numCores}_cores/avg_verify`, value: avgVerifyMs, unit: 'ms' },
        { name: `BatchVerify/16_proofs/${numCores}_cores/throughput`, value: throughput, unit: 'proofs/sec' },
      );

      logger.info(`16 proofs, ${numCores} cores`, {
        wallMs: Math.ceil(wallMs),
        avgVerifyMs: Math.ceil(avgVerifyMs),
        throughput: throughput.toFixed(2),
      });
    });
  }

  for (const batchSize of [2, 4, 8]) {
    it(`batch_size sweep: 8 proofs, batch_size=${batchSize}, 8 cores`, async () => {
      const numProofs = 8;
      const numCores = 8;
      const proofs = Array.from({ length: numProofs }, () => ({ vkIndex: 0, proofFields: validProofFields }));

      const wallStart = performance.now();
      const results = await runBatchVerifier(bb, { vks: [vk], numCores, batchSize, proofs });
      const wallMs = performance.now() - wallStart;

      expect(results).toHaveLength(numProofs);
      expect(results.every(r => r.status === 0)).toBe(true);

      const throughput = (numProofs / wallMs) * 1000;

      benchResults.push(
        { name: `BatchVerify/batch_size_${batchSize}/wall_time`, value: wallMs, unit: 'ms' },
        { name: `BatchVerify/batch_size_${batchSize}/throughput`, value: throughput, unit: 'proofs/sec' },
      );

      logger.info(`batch_size=${batchSize}`, {
        wallMs: Math.ceil(wallMs),
        throughput: throughput.toFixed(2),
      });
    });
  }

  it('bisection overhead: 8 proofs with 2 bad, batch_size=8, 8 cores', async () => {
    const numProofs = 8;
    const numBad = 2;
    const proofs = Array.from({ length: numProofs }, (_, i) => ({
      vkIndex: 0,
      proofFields: i < numBad ? invalidProofFields : validProofFields,
    }));

    const wallStart = performance.now();
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 8, batchSize: 8, proofs });
    const wallMs = performance.now() - wallStart;

    expect(results).toHaveLength(numProofs);
    const byId = results.sort((a, b) => a.request_id - b.request_id);
    expect(byId.filter(r => r.status === 0)).toHaveLength(numProofs - numBad);
    expect(byId.filter(r => r.status === 1)).toHaveLength(numBad);

    benchResults.push({ name: `BatchVerify/mixed_${numBad}_bad_of_${numProofs}/wall_time`, value: wallMs, unit: 'ms' });

    logger.info(`mixed ${numBad} bad of ${numProofs}`, { wallMs: Math.ceil(wallMs) });
  });
});
