/**
 * Confirms that a chonk proof produced via bb.js (the same proofFields the chonk WebGPU page
 * emits) is accepted by the independent native `bb verify --scheme chonk` verifier — not just
 * the in-process WASM verify.
 *
 * Uses a pinned protocol flow (the inputs the page proves) and the WASM MSM path, so it runs on
 * any machine without a GPU. A chonk proof is a deterministic function of (bytecode, witness,
 * vks) — the MSM only feeds a deterministic Fiat-Shamir transcript — so a correct WebGPU MSM
 * yields a byte-identical proof, and native acceptance here implies native acceptance of the
 * WebGPU-produced proof.
 *
 * Skips when the native bb binary or the pinned inputs are absent.
 */
import { AztecClientBackend, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { Unpackr } from 'msgpackr';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ungzip } from 'pako';

import { defaultBbBinaryPath, verifyChonkProofNatively } from './native_verify.js';

const logger = createLogger('ivc-integration:test:native-chonk-verify');

jest.setTimeout(300_000);

interface PinnedExecutionStep {
  function_name: string;
  bytecode: Uint8Array;
  witness: Uint8Array;
  vk: Uint8Array;
}

const FLOW = 'ecdsar1+transfer_0_recursions+sponsored_fpc';
const inputsPath = resolve(`../end-to-end/example-app-ivc-inputs-out/${FLOW}/ivc-inputs.msgpack`);
const bbBinaryPath = defaultBbBinaryPath();

function loadPinnedInputs(path: string) {
  const buf = new Uint8Array(readFileSync(path));
  const steps = new Unpackr({ useRecords: false, structuredClone: false }).unpack(buf) as PinnedExecutionStep[];
  return {
    bytecodes: steps.map(s => ungzip(s.bytecode)),
    witnesses: steps.map(s => ungzip(s.witness)),
    vks: steps.map(s => s.vk),
    names: steps.map(s => s.function_name),
  };
}

const canRun = existsSync(bbBinaryPath) && existsSync(inputsPath);
const describeMaybe = canRun ? describe : describe.skip;

describeMaybe('Native chonk verify of a bb.js proof', () => {
  let barretenberg: Barretenberg;

  beforeAll(async () => {
    barretenberg = await Barretenberg.initSingleton({ threads: 16, logger: (m: string) => logger.debug(m) });
  });

  afterAll(async () => {
    await Barretenberg.destroySingleton();
  });

  it(`proves ${FLOW} via bb.js and verifies it with native bb`, async () => {
    const { bytecodes, witnesses, vks, names } = loadPinnedInputs(inputsPath);
    const backend = new AztecClientBackend(bytecodes, barretenberg, names);
    const { proofFields, vk } = await backend.prove(witnesses, vks);
    logger.info(`proof: ${proofFields.length} field elements, vk: ${vk.length} bytes`);

    const { verified, exitCode, output } = await verifyChonkProofNatively(proofFields, vk, { bbBinaryPath });
    if (!verified) {
      logger.error(`native bb verify failed (exit ${exitCode}):\n${output}`);
    }
    expect(verified).toBe(true);
  });
});
