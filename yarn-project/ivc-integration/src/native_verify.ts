import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { concatChonkProofFields } from './chonk_native_proof.js';

/** Outcome of a native `bb verify --scheme chonk` run. */
export interface NativeVerifyResult {
  /** True iff the native bb binary exited 0 (proof accepted). */
  verified: boolean;
  /** The bb process exit code (0 = success). */
  exitCode: number;
  /** Captured stdout+stderr, for diagnosing a failure. */
  output: string;
}

/** Path to the native bb binary: repo-root/barretenberg/cpp/build/bin/bb, overridable via BB_BINARY_PATH. */
export function defaultBbBinaryPath(): string {
  if (process.env.BB_BINARY_PATH) {
    return process.env.BB_BINARY_PATH;
  }
  // This module lives at yarn-project/ivc-integration/src/ ; the binary is at repo root.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../barretenberg/cpp/build/bin/bb');
}

/**
 * Verify a ChonkProof with the native `bb` binary — an independent (non-WASM) check that a
 * proof produced in the browser/Node (e.g. via the WebGPU MSM path) is accepted by the
 * native verifier.
 *
 * Writes the proof (concatenated field elements) and vk to a temp directory and runs
 * `bb verify --scheme chonk --proof_path <dir>/proof --vk_path <dir>/vk`. The temp dir is
 * removed afterwards unless `keepFiles` is set.
 *
 * @param proofFields - Flat proof field elements from `AztecClientBackend.prove()`.
 * @param vk - The hiding-kernel verification key bytes from `AztecClientBackend.prove()`.
 */
export async function verifyChonkProofNatively(
  proofFields: Uint8Array[],
  vk: Uint8Array,
  opts: { bbBinaryPath?: string; crsPath?: string; keepFiles?: boolean } = {},
): Promise<NativeVerifyResult> {
  const bbBinaryPath = opts.bbBinaryPath ?? defaultBbBinaryPath();
  if (!existsSync(bbBinaryPath)) {
    throw new Error(`Native bb binary not found at ${bbBinaryPath} (set BB_BINARY_PATH to override)`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'chonk-native-verify-'));
  try {
    writeFileSync(join(dir, 'proof'), concatChonkProofFields(proofFields));
    writeFileSync(join(dir, 'vk'), vk);

    const args = ['verify', '--scheme', 'chonk', '--proof_path', join(dir, 'proof'), '--vk_path', join(dir, 'vk')];
    if (opts.crsPath) {
      args.push('--crs_path', opts.crsPath);
    }

    const { exitCode, output } = await runProcess(bbBinaryPath, args);
    return { verified: exitCode === 0, exitCode, output };
  } finally {
    if (!opts.keepFiles) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function runProcess(cmd: string, args: string[]): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    proc.stdout.on('data', (d: Buffer) => (output += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (output += d.toString()));
    proc.on('error', reject);
    proc.on('close', code => resolvePromise({ exitCode: code ?? -1, output }));
  });
}
