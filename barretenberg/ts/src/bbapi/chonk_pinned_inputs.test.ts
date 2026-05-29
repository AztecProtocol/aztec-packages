import { Decoder } from 'msgpackr';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ungzip } from 'pako';

import { AztecClientBackend, BackendType, Barretenberg } from '../index.js';

interface RawStep {
  bytecode: Buffer;
  witness: Buffer;
  vk: Buffer;
  functionName: string;
}

const TEST_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_WASM_FLOW_LIMIT = 1;
function findRepoRoot(): string {
  return process.env.AZTEC_REPO_ROOT ?? resolve(process.cwd(), '../..');
}

function ensurePinnedInputsRoot(): string {
  const explicit = process.env.CHONK_PINNED_IVC_INPUTS_DIR;
  if (explicit) {
    return explicit;
  }

  const repoRoot = findRepoRoot();
  return join(repoRoot, 'barretenberg/cpp/chonk-pinned-flows');
}

function discoverFlows(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map(name => join(root, name))
    .filter(path => statSync(path).isDirectory() && existsSync(join(path, 'ivc-inputs.msgpack')))
    .sort();
}

function selectFlows(flows: string[]): string[] {
  const filter = process.env.CHONK_PINNED_IVC_FLOW;
  const filtered = filter ? flows.filter(flow => basename(flow).includes(filter)) : flows;
  const limit = Number(process.env.CHONK_PINNED_IVC_FLOW_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
}

function loadPinnedFlow(flowDir: string) {
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
  };
}

function getWasmFlowLimit(): number {
  const parsed = Number(process.env.CHONK_PINNED_IVC_WASM_FLOW_LIMIT ?? DEFAULT_WASM_FLOW_LIMIT);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WASM_FLOW_LIMIT;
}

const wasmFlowLimit = getWasmFlowLimit();
const backendCases = [
  {
    label: 'native',
    backendType: BackendType.NativeUnixSocket,
    threads: 16,
    selectFlows: (flows: string[]) => flows,
  },
  {
    label: 'wasm',
    backendType: BackendType.Wasm,
    threads: 1,
    selectFlows: (flows: string[]) => flows.slice(0, Math.max(1, wasmFlowLimit)),
  },
] as const;

describe('Chonk pinned IVC inputs through bb.js', () => {
  let flows: string[];
  let bbPath: string | undefined;

  beforeAll(() => {
    const repoRoot = findRepoRoot();
    const defaultBbPath = join(repoRoot, 'barretenberg/cpp/build/bin/bb');
    bbPath = process.env.BB_BINARY_PATH ?? (existsSync(defaultBbPath) ? defaultBbPath : undefined);
    const pinnedRoot = ensurePinnedInputsRoot();
    const discoveredFlows = discoverFlows(pinnedRoot);
    if (discoveredFlows.length === 0) {
      throw new Error(
        `No pinned ivc-inputs.msgpack files found under ${pinnedRoot}. Run barretenberg/cpp/scripts/chonk_inputs.sh download first.`,
      );
    }
    flows = selectFlows(discoveredFlows);
    if (flows.length === 0 && process.env.CHONK_PINNED_IVC_FLOW) {
      throw new Error(`CHONK_PINNED_IVC_FLOW='${process.env.CHONK_PINNED_IVC_FLOW}' matched no pinned flows`);
    }
    if (flows.length === 0) {
      throw new Error(`No pinned ivc-inputs.msgpack files found under ${pinnedRoot}`);
    }
  }, TEST_TIMEOUT_MS);

  it.each(backendCases)(
    'proves and verifies pinned flows with $label backend',
    async backendCase => {
      const barretenberg = await Barretenberg.initSingleton({
        backend: backendCase.backendType,
        threads: backendCase.threads,
        ...(backendCase.backendType === BackendType.NativeUnixSocket && bbPath ? { bbPath } : {}),
      });

      try {
        for (const flowDir of backendCase.selectFlows(flows)) {
          const { bytecodes, witnesses, vks, names } = loadPinnedFlow(flowDir);
          const backend = new AztecClientBackend(bytecodes, barretenberg, names);
          const { proof, vk } = await backend.prove(witnesses, vks);
          const verified = await backend.verify(proof, vk);
          expect(verified).toBe(true);
        }
      } finally {
        await Barretenberg.destroySingleton();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
