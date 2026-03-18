import type { Barretenberg } from '@aztec/bb.js';
import { FifoFrameReader } from '@aztec/foundation/fifo';

import { Unpackr } from 'msgpackr';
import { execFile } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Result from the FIFO, matching the C++ VerifyResult struct. */
export interface FifoVerifyResult {
  request_id: number;
  status: number;
  error_message: string;
  time_in_verify_ms: number;
}

/** Read N length-delimited msgpack frames from a FIFO. */
export function readFifoResults(fifoPath: string, count: number): Promise<FifoVerifyResult[]> {
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

/** Create a FIFO and return its path + cleanup function. */
export async function createFifo(label: string): Promise<{ fifoPath: string; cleanup: () => Promise<void> }> {
  const fifoPath = join(tmpdir(), `bb-test-${label}-${process.pid}-${Date.now()}.fifo`);
  await execFileAsync('mkfifo', [fifoPath]);
  return {
    fifoPath,
    cleanup: () => unlink(fifoPath).catch(() => {}),
  };
}

/** Corrupt flat proof fields by flipping bytes in an early field element. */
export function corruptProofFields(fields: Uint8Array[]): Uint8Array[] {
  const corrupted = fields.map(f => Uint8Array.from(f));
  corrupted[2] = Uint8Array.from(corrupted[2]);
  corrupted[2][0] ^= 0xff;
  corrupted[2][1] ^= 0xff;
  return corrupted;
}

/** Run the batch verifier with the given workload and collect all results. */
export async function runBatchVerifier(
  bb: Barretenberg,
  opts: {
    vks: Uint8Array[];
    numCores: number;
    batchSize: number;
    proofs: { vkIndex: number; proofFields: Uint8Array[] }[];
  },
): Promise<FifoVerifyResult[]> {
  const { fifoPath, cleanup } = await createFifo(`${opts.numCores}c-${opts.proofs.length}p-bs${opts.batchSize}`);
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
    await cleanup();
  }
}
