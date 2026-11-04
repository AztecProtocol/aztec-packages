import { Decoder } from 'msgpackr';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ungzip } from 'pako';

import type { CircuitKind } from '../../circuit_kind.js';

interface RawStep {
  bytecode: Buffer;
  witness: Buffer;
  vk: Buffer;
  functionName: string;
  kind: CircuitKind;
}

export function findRepoRoot(): string {
  if (process.env.AZTEC_REPO_ROOT) {
    return process.env.AZTEC_REPO_ROOT;
  }
  // Identify the repo root by walking up to the directory containing barretenberg/cpp, so resolution is
  // independent of the depth the test is invoked from (e.g. barretenberg/ts vs barretenberg/ts/bb.js).
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'barretenberg/cpp'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return resolve(process.cwd(), '../../..');
}

export function ensurePinnedInputsRoot(): string {
  const explicit = process.env.CHONK_PINNED_IVC_INPUTS_DIR;
  if (explicit) {
    return explicit;
  }

  const repoRoot = findRepoRoot();
  return join(repoRoot, 'barretenberg/cpp/chonk-pinned-flows');
}

export function discoverFlows(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map(name => join(root, name))
    .filter(path => statSync(path).isDirectory() && existsSync(join(path, 'ivc-inputs.msgpack')))
    .sort();
}

export function loadPinnedFlow(flowDir: string) {
  const buf = readFileSync(join(flowDir, 'ivc-inputs.msgpack'));
  const steps = new Decoder({ useRecords: false }).unpack(buf) as RawStep[];
  if (steps.length === 0) {
    throw new Error(`No execution steps in ${join(flowDir, 'ivc-inputs.msgpack')}`);
  }
  return {
    bytecodes: steps.map(step => ungzip(step.bytecode)),
    witnesses: steps.map(step => ungzip(step.witness)),
    vks: steps.map(step => new Uint8Array(step.vk)),
    names: steps.map(step => step.functionName),
    kinds: steps.map(step => step.kind),
  };
}

export type PinnedFlow = ReturnType<typeof loadPinnedFlow>;

/** `BB_BINARY_PATH`, else this tree's native build when present, else undefined (the packaged binary). */
export function localBbPath(): string | undefined {
  const built = join(findRepoRoot(), 'barretenberg/cpp/build/bin/bb');
  return process.env.BB_BINARY_PATH ?? (existsSync(built) ? built : undefined);
}
