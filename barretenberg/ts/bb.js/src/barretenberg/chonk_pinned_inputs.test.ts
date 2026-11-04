import { basename } from 'node:path';

import { AztecClientBackend, BackendType, Barretenberg } from '../index.js';
import {
  type PinnedFlow,
  discoverFlows,
  ensurePinnedInputsRoot,
  loadPinnedFlow,
  localBbPath,
} from './testing/pinned_flows.js';

const TEST_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_WASM_FLOW_LIMIT = 1;
function selectFlows(flows: string[]): string[] {
  const filter = process.env.CHONK_PINNED_IVC_FLOW;
  const filtered = filter ? flows.filter(flow => basename(flow).includes(filter)) : flows;
  const limit = Number(process.env.CHONK_PINNED_IVC_FLOW_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
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
    preloadInputs: false,
  },
  {
    label: 'wasm',
    backendType: BackendType.Wasm,
    threads: 1,
    selectFlows: (flows: string[]) => flows.slice(0, Math.max(1, wasmFlowLimit)),
    preloadInputs: true,
  },
] as const;

describe('Chonk pinned IVC inputs through bb.js', () => {
  let flows: string[];
  const preloadedFlows = new Map<string, PinnedFlow>();
  let bbPath: string | undefined;

  beforeAll(() => {
    bbPath = localBbPath();
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
    // Treat disk fixtures as setup-only for cases that run after native backend teardown.
    for (const backendCase of backendCases) {
      if (!backendCase.preloadInputs) {
        continue;
      }
      for (const flowDir of backendCase.selectFlows(flows)) {
        preloadedFlows.set(flowDir, loadPinnedFlow(flowDir));
      }
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
          const { bytecodes, witnesses, vks, names, kinds } = backendCase.preloadInputs
            ? preloadedFlows.get(flowDir)!
            : loadPinnedFlow(flowDir);
          const backend = new AztecClientBackend(bytecodes, barretenberg, names, kinds);
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
