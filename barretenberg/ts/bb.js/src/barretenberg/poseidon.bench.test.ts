import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { Barretenberg, BarretenbergSync } from '../index.js';
import { BackendType } from './index.js';
import { Fr } from './testing/fields.js';

function warnBackendInitialization(name: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to initialize ${name} backend: ${message}\n`);
}

/**
 * Async API benchmark test: WASM vs Native backends with proper non-blocking I/O
 *
 * This test uses the async Barretenberg API which properly handles:
 * - Non-blocking I/O for native backend (event-based)
 * - Concurrent operations via promises
 * - Better performance for native backend compared to sync API
 */
describe('poseidon2Hash benchmark (Async API): WASM vs Native', () => {
  const ITERATIONS = 10000;
  const SIZES = [2, 4, 8];

  let wasmApi: Barretenberg | null = null;
  let nativeSocketApi: Barretenberg | null = null;
  let nativeShmApi: Barretenberg | null = null;
  let nativeShmSyncApi: BarretenbergSync | null = null;
  let wasm: BarretenbergWasmMain;

  beforeAll(async () => {
    // Setup direct WASM access for baseline benchmark (always required)
    wasm = new BarretenbergWasmMain();
    const { module } = await fetchModuleAndThreads(1);
    await wasm.init(module, 1);

    // Setup WASM API
    try {
      wasmApi = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true });
    } catch (error) {
      warnBackendInitialization('WASM', error);
    }

    // Setup native socket API
    try {
      nativeSocketApi = await Barretenberg.new({ backend: BackendType.NativeUnixSocket, threads: 1 });
    } catch (error) {
      warnBackendInitialization('Native Socket', error);
    }

    // Setup native shared memory API (async)
    try {
      nativeShmApi = await Barretenberg.new({ backend: BackendType.NativeSharedMemory, threads: 1 });
    } catch (error) {
      warnBackendInitialization('Native Shared Memory (async)', error);
    }

    // Setup native shared memory API (sync)
    try {
      nativeShmSyncApi = await BarretenbergSync.new({ backend: BackendType.NativeSharedMemory, threads: 1 });
    } catch (error) {
      warnBackendInitialization('Native Shared Memory (sync)', error);
    }
  }, 20000);

  it.each(SIZES)(
    'benchmark with %p field elements',
    async size => {
      // Generate random inputs
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random().toBuffer());

      // Each mode runs once untimed first, so the JIT has seen the exact call
      // pattern being timed (a pipelined burst exercises different code paths
      // from sequential awaits) and the timing reflects steady state.
      const timed = async (run: () => Promise<void> | void) => {
        await run();
        const start = performance.now();
        await run();
        return performance.now() - start;
      };
      const sequential = (api: Barretenberg) => async () => {
        for (let i = 0; i < ITERATIONS; i++) {
          await api.poseidon2Hash({ inputs });
        }
      };
      const pipelined = (api: Barretenberg) => async () => {
        const promises = [];
        for (let i = 0; i < ITERATIONS; i++) {
          promises.push(api.poseidon2Hash({ inputs }));
        }
        await Promise.all(promises);
      };

      const wasmTime = wasmApi ? await timed(sequential(wasmApi)) : 0;
      const nativeSocketTime = nativeSocketApi ? await timed(sequential(nativeSocketApi)) : 0;
      const nativeSocketPipelinedTime = nativeSocketApi ? await timed(pipelined(nativeSocketApi)) : 0;
      const nativeShmTime = nativeShmApi ? await timed(sequential(nativeShmApi)) : 0;
      const nativeShmPipelinedTime = nativeShmApi ? await timed(pipelined(nativeShmApi)) : 0;
      const nativeShmSyncTime = nativeShmSyncApi
        ? await timed(() => {
            for (let i = 0; i < ITERATIONS; i++) {
              nativeShmSyncApi!.poseidon2Hash({ inputs });
            }
          })
        : 0;

      // Calculate metrics (all relative to WASM baseline)
      const nativeSocketOverhead = ((nativeSocketTime - wasmTime) / wasmTime) * 100;
      const nativeSocketPipelinedOverhead = ((nativeSocketPipelinedTime - wasmTime) / wasmTime) * 100;
      const nativeShmOverhead = ((nativeShmTime - wasmTime) / wasmTime) * 100;
      const nativeShmPipelinedOverhead = ((nativeShmPipelinedTime - wasmTime) / wasmTime) * 100;
      const nativeShmSyncOverhead = ((nativeShmSyncTime - wasmTime) / wasmTime) * 100;

      const avgWasmTimeUs = (wasmTime / ITERATIONS) * 1000;
      const avgNativeSocketTimeUs = (nativeSocketTime / ITERATIONS) * 1000;
      const avgNativeSocketPipelinedTimeUs = (nativeSocketPipelinedTime / ITERATIONS) * 1000;
      const avgNativeShmTimeUs = (nativeShmTime / ITERATIONS) * 1000;
      const avgNativeShmPipelinedTimeUs = (nativeShmPipelinedTime / ITERATIONS) * 1000;
      const avgNativeShmSyncTimeUs = (nativeShmSyncTime / ITERATIONS) * 1000;

      process.stdout.write(
        `┌─ Size ${size.toString().padStart(3)} field elements ───────────────────────────────────────┐\n`,
      );
      const formatOverhead = (overhead: number): string => {
        const sign = overhead >= 0 ? '+' : '-';
        const value = Math.abs(overhead).toFixed(1).padStart(6);
        return `${sign}${value}%`;
      };

      if (wasmApi) {
        process.stdout.write(
          `│ WASM:                    ${wasmTime.toFixed(2).padStart(8)}ms (${avgWasmTimeUs.toFixed(2).padStart(7)}µs/call) [baseline] │\n`,
        );
      } else {
        process.stdout.write(`│ WASM:                                               unavailable │\n`);
      }

      if (nativeSocketApi) {
        process.stdout.write(
          `│ Native Socket:           ${nativeSocketTime.toFixed(2).padStart(8)}ms (${avgNativeSocketTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeSocketOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Socket:                                      unavailable │\n`);
      }

      if (nativeSocketApi) {
        process.stdout.write(
          `│ Native Socket Pipelined: ${nativeSocketPipelinedTime
            .toFixed(2)
            .padStart(8)}ms (${avgNativeSocketPipelinedTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(
            nativeSocketPipelinedOverhead,
          )}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Socket Pipelined:                            unavailable │\n`);
      }

      if (nativeShmApi) {
        process.stdout.write(
          `│ Native Shared:           ${nativeShmTime.toFixed(2).padStart(8)}ms (${avgNativeShmTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Shared:                                      unavailable │\n`);
      }

      if (nativeShmApi) {
        process.stdout.write(
          `│ Native Shared Pipelined: ${nativeShmPipelinedTime.toFixed(2).padStart(8)}ms (${avgNativeShmPipelinedTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmPipelinedOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Shared Pipelined:                            unavailable │\n`);
      }

      if (nativeShmSyncApi) {
        process.stdout.write(
          `│ Native Shared Sync:      ${nativeShmSyncTime.toFixed(2).padStart(8)}ms (${avgNativeShmSyncTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmSyncOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Shared Sync:                                 unavailable │\n`);
      }

      process.stdout.write(`└─────────────────────────────────────────────────────────────────┘\n`);

      const wasmResult = await wasmApi!.poseidon2Hash({ inputs });

      if (nativeSocketApi) {
        const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeSocketResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmApi) {
        const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmSyncApi) {
        const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(wasmResult.hash);
      }

      // Test always passes, this is just for measuring performance
      expect(true).toBe(true);
    },
    30000,
  );

  const TEST_VECTORS = [1, 2, 3, 5, 10, 50, 100];
  const NUM_RANDOM_TESTS = 10;

  it.each(TEST_VECTORS)('produces identical results for %p field elements', async size => {
    // Test with multiple random input vectors
    for (let test = 0; test < NUM_RANDOM_TESTS; test++) {
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random().toBuffer());

      const wasmResult = await wasmApi!.poseidon2Hash({ inputs });

      if (nativeSocketApi) {
        const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeSocketResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmApi) {
        const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmSyncApi) {
        const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(wasmResult.hash);
      }
    }
  });
});
