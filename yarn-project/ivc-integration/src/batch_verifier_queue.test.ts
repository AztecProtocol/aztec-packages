/**
 * Batch chonk verifier queue robustness tests.
 *
 * Exercises edge cases: sub-batch flush, single proof, degenerate batch sizes,
 * all-invalid, mixed valid/invalid with bisection, sequential start/stop cycles,
 * and core count extremes.
 *
 * Detailed performance benchmarks live in C++ (chonk.bench.cpp) alongside
 * pinned IVC inputs.
 */
import { AztecClientBackend, BackendType, Barretenberg, type ChonkProof, toChonkProof } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { Unpackr } from 'msgpackr';
import { execFileSync } from 'node:child_process';
import { createReadStream, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:test:batch-verifier-queue');

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
    const stream = createReadStream(fifoPath, { highWaterMark: 64 * 1024 });
    const results: FifoVerifyResult[] = [];
    let pendingBuf: Buffer = Buffer.alloc(0);

    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      pendingBuf = pendingBuf.length > 0 ? Buffer.concat([pendingBuf, buf]) : buf;

      while (pendingBuf.length >= 4) {
        const payloadLen = pendingBuf.readUInt32BE(0);
        if (payloadLen === 0 || payloadLen > 10 * 1024 * 1024) {
          stream.destroy();
          reject(new Error(`Invalid payload length: ${payloadLen}`));
          return;
        }
        const frameLen = 4 + payloadLen;
        if (pendingBuf.length < frameLen) {
          break;
        }
        const payloadBuf = pendingBuf.subarray(4, frameLen);
        pendingBuf = pendingBuf.subarray(frameLen);
        results.push(unpackr.unpack(payloadBuf) as FifoVerifyResult);

        if (results.length >= count) {
          stream.destroy();
          resolve(results);
          return;
        }
      }
    });

    stream.on('error', err => {
      if (results.length >= count) {
        return;
      }
      reject(err);
    });
    stream.on('end', () => {
      if (results.length >= count) {
        resolve(results);
      } else {
        reject(new Error(`FIFO ended after ${results.length}/${count} results`));
      }
    });
  });
}

function createFifo(label: string): { fifoPath: string; cleanup: () => void } {
  const fifoPath = join(tmpdir(), `bb-test-${label}-${process.pid}-${Date.now()}.fifo`);
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

function decodeChonkProof(proofBuf: Uint8Array): ChonkProof {
  const unpackr = new Unpackr({ useRecords: false });
  return toChonkProof(unpackr.unpack(proofBuf));
}

/** Create a corrupted ChonkProof by incrementing a field element in the mega proof. */
function corruptChonkProof(proof: ChonkProof): ChonkProof {
  if (proof.megaProof.length <= 2) {
    throw new Error(`Cannot corrupt proof: megaProof has only ${proof.megaProof.length} elements`);
  }
  const corruptedMega = proof.megaProof.map(f => Uint8Array.from(f));
  corruptedMega[2][31] = (corruptedMega[2][31] + 1) & 0xff;
  return { megaProof: corruptedMega, goblinProof: proof.goblinProof };
}

/** Run the batch verifier with the given workload and collect all results. */
async function runBatchVerifier(
  bb: Barretenberg,
  opts: {
    vks: Uint8Array[];
    numCores: number;
    batchSize: number;
    proofs: { vkIndex: number; proof: ChonkProof }[];
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
        proof: opts.proofs[i].proof,
      });
    }

    await bb.chonkBatchVerifierStop({});
    return await resultPromise;
  } finally {
    cleanup();
  }
}

describe('Batch Chonk Verifier Queue', () => {
  let bb: Barretenberg;
  let validProof: ChonkProof;
  let invalidProof: ChonkProof;
  let vk: Uint8Array;

  beforeAll(async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket });
    await bb.initSRSChonk();

    logger.info('Generating proof for tests...');
    const [bytecodes, witnesses, , vks] = await generateTestingIVCStack(1, 0);
    const backend = new AztecClientBackend(bytecodes, bb);
    const [, proofBuf, generatedVk] = await backend.prove(witnesses, vks);
    validProof = decodeChonkProof(proofBuf);
    invalidProof = corruptChonkProof(validProof);
    vk = generatedVk;
    logger.info('Proof generated');
  });

  afterAll(async () => {
    await bb.destroy();
  });

  // -- Basic cases --

  it('single valid proof', async () => {
    const results = await runBatchVerifier(bb, {
      vks: [vk],
      numCores: 4,
      batchSize: 8,
      proofs: [{ vkIndex: 0, proof: validProof }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe(0);
    expect(results[0].request_id).toBe(0);
  });

  it('single invalid proof', async () => {
    const results = await runBatchVerifier(bb, {
      vks: [vk],
      numCores: 4,
      batchSize: 8,
      proofs: [{ vkIndex: 0, proof: invalidProof }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe(1);
  });

  // -- Sub-batch flush: N < batch_size --

  for (const n of [1, 2, 3, 5, 7]) {
    it(`flushes ${n} proof(s) with batch_size=8`, async () => {
      const proofs = Array.from({ length: n }, () => ({ vkIndex: 0, proof: validProof }));
      const results = await runBatchVerifier(bb, { vks: [vk], numCores: 4, batchSize: 8, proofs });
      expect(results).toHaveLength(n);
      expect(results.every(r => r.status === 0)).toBe(true);
    });
  }

  // -- Exact batch boundary --

  it('N exactly equals batch_size', async () => {
    const results = await runBatchVerifier(bb, {
      vks: [vk],
      numCores: 4,
      batchSize: 4,
      proofs: Array.from({ length: 4 }, () => ({ vkIndex: 0, proof: validProof })),
    });
    expect(results).toHaveLength(4);
    expect(results.every(r => r.status === 0)).toBe(true);
  });

  it('N is one more than batch_size', async () => {
    const results = await runBatchVerifier(bb, {
      vks: [vk],
      numCores: 4,
      batchSize: 4,
      proofs: Array.from({ length: 5 }, () => ({ vkIndex: 0, proof: validProof })),
    });
    expect(results).toHaveLength(5);
    expect(results.every(r => r.status === 0)).toBe(true);
  });

  // -- Degenerate batch_size=1 (every proof is its own batch) --

  it('batch_size=1 verifies each proof individually', async () => {
    const proofs = [
      { vkIndex: 0, proof: validProof },
      { vkIndex: 0, proof: invalidProof },
      { vkIndex: 0, proof: validProof },
      { vkIndex: 0, proof: invalidProof },
    ];
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 4, batchSize: 1, proofs });
    expect(results).toHaveLength(4);
    const byId = results.sort((a, b) => a.request_id - b.request_id);
    expect(byId[0].status).toBe(0);
    expect(byId[1].status).toBe(1);
    expect(byId[2].status).toBe(0);
    expect(byId[3].status).toBe(1);
  });

  // -- All invalid --

  it('all proofs invalid', async () => {
    const proofs = Array.from({ length: 8 }, () => ({ vkIndex: 0, proof: invalidProof }));
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 4, batchSize: 4, proofs });
    expect(results).toHaveLength(8);
    expect(results.every(r => r.status === 1)).toBe(true);
  });

  // -- Mixed valid/invalid with bisection --

  it('1 bad out of 8 (bisection identifies it)', async () => {
    const proofs = Array.from({ length: 8 }, (_, i) => ({
      vkIndex: 0,
      proof: i === 3 ? invalidProof : validProof,
    }));
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 4, batchSize: 8, proofs });
    expect(results).toHaveLength(8);
    const byId = results.sort((a, b) => a.request_id - b.request_id);
    expect(byId[3].status).toBe(1);
    expect(byId.filter(r => r.status === 0)).toHaveLength(7);
  });

  it('bad proofs at batch boundaries', async () => {
    const proofs = Array.from({ length: 8 }, (_, i) => ({
      vkIndex: 0,
      proof: i === 0 || i === 4 ? invalidProof : validProof,
    }));
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 4, batchSize: 4, proofs });
    expect(results).toHaveLength(8);
    const byId = results.sort((a, b) => a.request_id - b.request_id);
    expect(byId[0].status).toBe(1);
    expect(byId[4].status).toBe(1);
    expect(byId.filter(r => r.status === 0)).toHaveLength(6);
  });

  it('half bad proofs', async () => {
    const proofs = Array.from({ length: 16 }, (_, i) => ({
      vkIndex: 0,
      proof: i % 2 === 0 ? invalidProof : validProof,
    }));
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 8, batchSize: 8, proofs });
    expect(results).toHaveLength(16);
    expect(results.filter(r => r.status === 0)).toHaveLength(8);
    expect(results.filter(r => r.status === 1)).toHaveLength(8);
  });

  // -- Core count extremes --

  it('works with numCores=1', async () => {
    const proofs = Array.from({ length: 4 }, () => ({ vkIndex: 0, proof: validProof }));
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 1, batchSize: 4, proofs });
    expect(results).toHaveLength(4);
    expect(results.every(r => r.status === 0)).toBe(true);
  });

  it('16 cores, batch_size=16, 32 proofs', async () => {
    const proofs = Array.from({ length: 32 }, () => ({ vkIndex: 0, proof: validProof }));
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 16, batchSize: 16, proofs });
    expect(results).toHaveLength(32);
    expect(results.every(r => r.status === 0)).toBe(true);
  });

  // -- Request ID tracking --

  it('returns correct request_ids for all proofs', async () => {
    const n = 12;
    const proofs = Array.from({ length: n }, () => ({ vkIndex: 0, proof: validProof }));
    const results = await runBatchVerifier(bb, { vks: [vk], numCores: 4, batchSize: 4, proofs });
    const ids = results.map(r => r.request_id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  // -- Sequential start/stop cycles --

  it('can start, verify, stop, then start again', async () => {
    const results1 = await runBatchVerifier(bb, {
      vks: [vk],
      numCores: 4,
      batchSize: 4,
      proofs: Array.from({ length: 4 }, () => ({ vkIndex: 0, proof: validProof })),
    });
    expect(results1).toHaveLength(4);
    expect(results1.every(r => r.status === 0)).toBe(true);

    const results2 = await runBatchVerifier(bb, {
      vks: [vk],
      numCores: 8,
      batchSize: 2,
      proofs: [
        { vkIndex: 0, proof: validProof },
        { vkIndex: 0, proof: invalidProof },
        { vkIndex: 0, proof: validProof },
      ],
    });
    expect(results2).toHaveLength(3);
    const byId = results2.sort((a, b) => a.request_id - b.request_id);
    expect(byId[0].status).toBe(0);
    expect(byId[1].status).toBe(1);
    expect(byId[2].status).toBe(0);
  });
});
