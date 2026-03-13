import { AztecClientBackend, BackendType, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { Unpackr } from 'msgpackr';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:test:batch-verifier');

jest.setTimeout(300_000);

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
    const stream = fs.createReadStream(fifoPath, { highWaterMark: 64 * 1024 });
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

/** Helper: create a FIFO and return its path + cleanup function. */
function createFifo(label: string): { fifoPath: string; cleanup: () => void } {
  const fifoPath = path.join(os.tmpdir(), `bb-batch-${label}-${process.pid}-${Date.now()}.fifo`);
  execSync(`mkfifo ${fifoPath}`);
  return {
    fifoPath,
    cleanup: () => {
      try {
        fs.unlinkSync(fifoPath);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Serialize proof field arrays into a single concatenated byte buffer. */
function flattenProofFields(proofFields: Uint8Array[]): Uint8Array {
  return Buffer.concat(proofFields.map(f => Buffer.from(f)));
}

/** Corrupt a proof buffer at a specific offset. */
function corruptProof(proofBytes: Uint8Array): Uint8Array {
  const corrupted = Buffer.from(proofBytes);
  corrupted[64] ^= 0xff;
  corrupted[65] ^= 0xff;
  return corrupted;
}

describe('Batch Chonk Verifier workloads', () => {
  let bb: Barretenberg;
  // Cache a proof + VK so we don't re-prove for every test
  let validProofBytes: Uint8Array;
  let invalidProofBytes: Uint8Array;
  let vk: Uint8Array;
  // Second proof from a different circuit stack (complex tx with reader app)
  let validProofBytes2: Uint8Array;
  let vk2: Uint8Array;

  beforeAll(async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket });
    await bb.initSRSChonk();

    // Generate proof from simple tx (1 creator, 0 readers)
    logger.info('Generating simple proof...');
    const [bytecodes1, witnesses1, , vks1] = await generateTestingIVCStack(1, 0);
    const backend1 = new AztecClientBackend(bytecodes1, bb);
    const [proofFields1, , generatedVk1] = await backend1.prove(witnesses1, vks1);
    validProofBytes = flattenProofFields(proofFields1);
    invalidProofBytes = corruptProof(validProofBytes);
    vk = generatedVk1;

    // Generate proof from complex tx (1 creator, 1 reader) — different circuit stack, same VK type
    logger.info('Generating complex proof...');
    const [bytecodes2, witnesses2, , vks2] = await generateTestingIVCStack(1, 1);
    const backend2 = new AztecClientBackend(bytecodes2, bb);
    const [proofFields2, , generatedVk2] = await backend2.prove(witnesses2, vks2);
    validProofBytes2 = flattenProofFields(proofFields2);
    vk2 = generatedVk2;

    logger.info('Proofs generated, ready for batch tests');
  });

  afterAll(async () => {
    await bb.destroy();
  });

  it('should flush a single proof without waiting for a full batch', async () => {
    const { fifoPath, cleanup } = createFifo('single');

    try {
      // batch_size=4 but we only queue 1 proof — must not hang
      await bb.chonkBatchVerifierStart({
        vks: [vk],
        numCores: 0,
        batchSize: 4,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, 1);

      await bb.chonkBatchVerifierQueue({
        requestId: 7,
        vkIndex: 0,
        proofFields: validProofBytes,
      });

      // Don't call stop — the result should arrive via the partial-batch timeout
      const results = await resultPromise;

      expect(results).toHaveLength(1);
      expect(results[0].request_id).toBe(7);
      expect(results[0].status).toBe(0);

      logger.info('Single-proof flush test passed', {
        verifyMs: Math.ceil(results[0].time_in_verify_ms),
      });

      await bb.chonkBatchVerifierStop({});
    } finally {
      cleanup();
    }
  });

  it('should verify multiple proofs in parallel', async () => {
    const numProofs = 4;
    const { fifoPath, cleanup } = createFifo('parallel');

    try {
      await bb.chonkBatchVerifierStart({
        vks: [vk],
        numCores: 0,
        batchSize: 8,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, numProofs);

      // Queue all proofs
      for (let i = 0; i < numProofs; i++) {
        await bb.chonkBatchVerifierQueue({
          requestId: i,
          vkIndex: 0,
          proofFields: validProofBytes,
        });
      }

      await bb.chonkBatchVerifierStop({});
      const results = await resultPromise;

      expect(results).toHaveLength(numProofs);
      const resultsByRequestId = new Map(results.map(r => [r.request_id, r]));
      for (let i = 0; i < numProofs; i++) {
        const r = resultsByRequestId.get(i);
        expect(r).toBeDefined();
        expect(r!.status).toBe(0);
      }

      logger.info(`Parallel test: ${numProofs} proofs verified`, {
        verifyTimes: results.map(r => Math.ceil(r.time_in_verify_ms)),
      });
    } finally {
      cleanup();
    }
  });

  it('should handle mixed valid and invalid proofs in one batch', async () => {
    const { fifoPath, cleanup } = createFifo('mixed');

    // Interleave valid and invalid proofs
    const proofs: { id: number; bytes: Uint8Array; expectedStatus: number }[] = [
      { id: 0, bytes: validProofBytes, expectedStatus: 0 },
      { id: 1, bytes: invalidProofBytes, expectedStatus: 1 },
      { id: 2, bytes: validProofBytes, expectedStatus: 0 },
      { id: 3, bytes: invalidProofBytes, expectedStatus: 1 },
      { id: 4, bytes: validProofBytes, expectedStatus: 0 },
    ];

    try {
      await bb.chonkBatchVerifierStart({
        vks: [vk],
        numCores: 0,
        batchSize: 8,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, proofs.length);

      for (const p of proofs) {
        await bb.chonkBatchVerifierQueue({
          requestId: p.id,
          vkIndex: 0,
          proofFields: p.bytes,
        });
      }

      await bb.chonkBatchVerifierStop({});
      const results = await resultPromise;

      expect(results).toHaveLength(proofs.length);
      const resultsByRequestId = new Map(results.map(r => [r.request_id, r]));

      for (const p of proofs) {
        const r = resultsByRequestId.get(p.id);
        expect(r).toBeDefined();
        expect(r!.status).toBe(p.expectedStatus);
      }

      const numValid = results.filter(r => r.status === 0).length;
      const numInvalid = results.filter(r => r.status === 1).length;
      logger.info(`Mixed test: ${numValid} valid, ${numInvalid} invalid`);
    } finally {
      cleanup();
    }
  });

  it('should verify proofs with multiple VKs', async () => {
    const { fifoPath, cleanup } = createFifo('multi-vk');

    try {
      // Register both VKs
      await bb.chonkBatchVerifierStart({
        vks: [vk, vk2],
        numCores: 0,
        batchSize: 8,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, 4);

      // Queue proofs against their respective VKs
      await bb.chonkBatchVerifierQueue({ requestId: 0, vkIndex: 0, proofFields: validProofBytes });
      await bb.chonkBatchVerifierQueue({ requestId: 1, vkIndex: 1, proofFields: validProofBytes2 });
      await bb.chonkBatchVerifierQueue({ requestId: 2, vkIndex: 0, proofFields: validProofBytes });
      await bb.chonkBatchVerifierQueue({ requestId: 3, vkIndex: 1, proofFields: validProofBytes2 });

      await bb.chonkBatchVerifierStop({});
      const results = await resultPromise;

      expect(results).toHaveLength(4);
      const resultsByRequestId = new Map(results.map(r => [r.request_id, r]));
      for (let i = 0; i < 4; i++) {
        const r = resultsByRequestId.get(i);
        expect(r).toBeDefined();
        expect(r!.status).toBe(0);
      }

      logger.info('Multi-VK test: all 4 proofs verified with correct VKs');
    } finally {
      cleanup();
    }
  });

  it('should measure throughput for batch sizes', async () => {
    for (const batchSize of [2, 4, 8]) {
      const { fifoPath, cleanup } = createFifo(`throughput-${batchSize}`);

      try {
        await bb.chonkBatchVerifierStart({
          vks: [vk],
          numCores: 0,
          batchSize,
          fifoPath,
        });

        const resultPromise = readFifoResults(fifoPath, batchSize);
        const wallStart = performance.now();

        for (let i = 0; i < batchSize; i++) {
          await bb.chonkBatchVerifierQueue({
            requestId: i,
            vkIndex: 0,
            proofFields: validProofBytes,
          });
        }

        await bb.chonkBatchVerifierStop({});
        const results = await resultPromise;
        const wallMs = performance.now() - wallStart;

        expect(results).toHaveLength(batchSize);
        for (const r of results) {
          expect(r.status).toBe(0);
        }

        const avgVerifyMs = results.reduce((sum, r) => sum + r.time_in_verify_ms, 0) / results.length;
        const throughput = (batchSize / wallMs) * 1000;

        logger.info(`Throughput (batch_size=${batchSize})`, {
          batchSize,
          wallMs: Math.ceil(wallMs),
          avgVerifyMs: Math.ceil(avgVerifyMs),
          throughputProofsPerSec: throughput.toFixed(2),
        });
      } finally {
        cleanup();
      }
    }
  });
});
